import { WebSocketServer } from 'ws';

export class HubWebSocket {
  constructor(server, nodeManager) {
    this.wss = new WebSocketServer({ server });
    this.nodeManager = nodeManager;
    this.clients = new Set();

    this._setupServer();
    this._setupListeners();
  }

  _setupServer() {
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      console.log(`[HubWS] Client connected (${this.clients.size} total)`);

      // Send initial state
      const nodes = this.nodeManager.getAllStatus();
      ws.send(JSON.stringify({
        type: 'init',
        nodes,
      }));

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`[HubWS] Client disconnected (${this.clients.size} total)`);
      });

      ws.on('error', () => this.clients.delete(ws));
    });
  }

  _setupListeners() {
    this.nodeManager.on('nodeOnline', (nodeId) => {
      const status = this.nodeManager.getNodeStatus(nodeId);
      this.broadcast({
        type: 'nodeOnline',
        nodeId,
        state: status ? status.state : null,
      });
    });

    this.nodeManager.on('nodeOffline', (nodeId) => {
      this.broadcast({ type: 'nodeOffline', nodeId });
    });

    this.nodeManager.on('nodeState', (nodeId, state) => {
      this.broadcast({ type: 'nodeState', nodeId, state });
    });

    this.nodeManager.on('nodeEvent', (nodeId, event) => {
      this.broadcast({ type: 'nodeEvent', nodeId, event });
    });
  }

  broadcast(message) {
    const json = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(json);
      }
    }
  }
}
