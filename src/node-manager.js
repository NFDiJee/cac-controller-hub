import { EventEmitter } from 'events';
import WebSocket from 'ws';
import * as db from './database.js';

export class NodeManager extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map(); // nodeId -> { node, ws, state, connected, lastSeen, reconnectTimer }
  }

  connectAll() {
    const nodes = db.getAllNodes();
    for (const node of nodes) {
      if (node.enabled) this.connectNode(node);
    }
    console.log(`[NodeManager] Connecting to ${nodes.filter(n => n.enabled).length} nodes...`);
  }

  disconnectAll() {
    for (const [id, conn] of this.connections) {
      conn._intentionalClose = true;
      if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);
      if (conn.healthTimer) clearInterval(conn.healthTimer);
      if (conn.ws) conn.ws.close();
    }
    this.connections.clear();
  }

  connectNode(node) {
    if (this.connections.has(node.id)) {
      const existing = this.connections.get(node.id);
      existing._intentionalClose = true;
      if (existing.reconnectTimer) clearTimeout(existing.reconnectTimer);
      if (existing.healthTimer) clearInterval(existing.healthTimer);
      if (existing.ws) existing.ws.close();
    }

    const conn = {
      node,
      ws: null,
      state: null,
      connected: false,
      lastSeen: null,
      reconnectTimer: null,
      healthTimer: null,
      _intentionalClose: false,
    };
    this.connections.set(node.id, conn);
    this._wsConnect(conn);
  }

  disconnectNode(nodeId) {
    const conn = this.connections.get(nodeId);
    if (!conn) return;
    conn._intentionalClose = true;
    if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);
    if (conn.healthTimer) clearInterval(conn.healthTimer);
    if (conn.ws) conn.ws.close();
    this.connections.delete(nodeId);
  }

  _wsConnect(conn) {
    const { node } = conn;
    const wsUrl = node.url.replace(/^http/, 'ws') + `/?hub=1&apikey=${encodeURIComponent(node.api_key)}`;

    try {
      const ws = new WebSocket(wsUrl, { handshakeTimeout: 10000 });
      conn.ws = ws;

      ws.on('open', () => {
        console.log(`[NodeManager] Connected to node "${node.name}" (${node.url})`);
        conn.connected = true;
        conn.lastSeen = Date.now();
        this.emit('nodeOnline', node.id);

        // Start health checks
        conn.healthTimer = setInterval(() => this._healthCheck(conn), 30000);
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          conn.lastSeen = Date.now();

          if (msg.type === 'hubInit') {
            // Remap player1/player2 keys to numeric 1/2 to match playerState events
            const rawPlayers = msg.data.players || {};
            const players = {};
            if (rawPlayers.player1) players[1] = rawPlayers.player1;
            if (rawPlayers.player2) players[2] = rawPlayers.player2;
            conn.state = {
              name: msg.data.name || node.name,
              room: msg.data.room || node.room,
              model: msg.data.model || node.model,
              players,
              playModes: rawPlayers.playModes || {},
              scanner: msg.data.scanner || {},
            };
            // Update node info in DB if provided by the node
            if (msg.data.name && msg.data.name !== node.name) {
              db.updateNode(node.id, { name: msg.data.name });
              conn.node = db.getNode(node.id);
            }
            if (msg.data.room && msg.data.room !== node.room) {
              db.updateNode(node.id, { room: msg.data.room });
              conn.node = db.getNode(node.id);
            }
            if (msg.data.model) {
              db.updateNode(node.id, { model: msg.data.model });
              conn.node = db.getNode(node.id);
            }
            this.emit('nodeState', node.id, conn.state);
          } else {
            // Forward all other events
            if (msg.type === 'playerState' && conn.state) {
              if (!conn.state.players) conn.state.players = {};
              conn.state.players[msg.playerId] = msg.data;
            }
            if (msg.type === 'scanProgress' && conn.state) {
              conn.state.scanner = msg.data;
            }
            if (msg.type === 'scanComplete' && conn.state) {
              conn.state.scanner = { scanning: false };
            }
            this.emit('nodeEvent', node.id, msg);
          }
        } catch (e) {
          // Ignore parse errors
        }
      });

      ws.on('close', (code, reason) => {
        conn.connected = false;
        if (conn.healthTimer) clearInterval(conn.healthTimer);
        conn.healthTimer = null;

        if (!conn._intentionalClose) {
          console.log(`[NodeManager] Lost connection to "${node.name}" (code ${code})`);
          this.emit('nodeOffline', node.id);
          this._scheduleReconnect(conn);
        }
      });

      ws.on('error', (err) => {
        // Suppress connection errors, close handler will deal with reconnect
        if (conn.connected) {
          console.error(`[NodeManager] WS error for "${node.name}": ${err.message}`);
        }
      });
    } catch (err) {
      console.error(`[NodeManager] Failed to connect to "${node.name}": ${err.message}`);
      this._scheduleReconnect(conn);
    }
  }

  _scheduleReconnect(conn) {
    if (conn._intentionalClose) return;
    const interval = parseInt(db.getSetting('reconnect_interval')) || 10000;
    conn.reconnectTimer = setTimeout(() => {
      if (!conn._intentionalClose) {
        // Refresh node data from DB
        const fresh = db.getNode(conn.node.id);
        if (fresh && fresh.enabled) {
          conn.node = fresh;
          this._wsConnect(conn);
        }
      }
    }, interval);
  }

  async _healthCheck(conn) {
    if (!conn.connected) return;
    try {
      const resp = await fetch(`${conn.node.url}/api/node/status`, {
        headers: { 'X-API-Key': conn.node.api_key },
        signal: AbortSignal.timeout(10000),
      });
      if (resp.ok) {
        const data = await resp.json();
        conn.lastSeen = Date.now();
        if (conn.state) {
          // Remap player1/player2 to numeric keys
          const raw = data.players || {};
          if (raw.player1) conn.state.players[1] = raw.player1;
          if (raw.player2) conn.state.players[2] = raw.player2;
          if (raw.playModes) conn.state.playModes = raw.playModes;
          conn.state.serialConnected = data.serialConnected;
        }
      }
    } catch {
      // Health check failed, WS close will handle reconnect
    }
  }

  // ── Public API ──

  getNodeStatus(nodeId) {
    const conn = this.connections.get(nodeId);
    if (!conn) return null;
    return {
      connected: conn.connected,
      lastSeen: conn.lastSeen,
      state: conn.state,
    };
  }

  getAllStatus() {
    const nodes = db.getAllNodes();
    return nodes.map(node => {
      const conn = this.connections.get(node.id);
      return {
        ...node,
        api_key: undefined, // Don't expose API keys
        connected: conn ? conn.connected : false,
        lastSeen: conn ? conn.lastSeen : null,
        state: conn ? conn.state : null,
      };
    });
  }

  async proxyRequest(nodeId, method, path, body) {
    const node = db.getNode(nodeId);
    if (!node) throw new Error('Node not found');

    const url = `${node.url}/api/${path}`;
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': node.api_key,
      },
      signal: AbortSignal.timeout(30000),
    };

    if (body && !['GET', 'HEAD'].includes(method)) {
      opts.body = JSON.stringify(body);
    }

    const resp = await fetch(url, opts);
    const contentType = resp.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      return { status: resp.status, data: await resp.json() };
    }
    return { status: resp.status, data: await resp.text() };
  }

  // Proxy binary content (covers, etc.)
  async proxyBinary(nodeId, path) {
    const node = db.getNode(nodeId);
    if (!node) throw new Error('Node not found');

    const url = `${node.url}/${path}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return null;

    return {
      contentType: resp.headers.get('content-type'),
      buffer: Buffer.from(await resp.arrayBuffer()),
    };
  }
}
