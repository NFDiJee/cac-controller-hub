import { Router } from 'express';
import * as db from './database.js';

export function createRoutes(nodeManager) {
  const router = Router();

  // ── Hub Status ──

  router.get('/api/hub/status', (req, res) => {
    res.json({
      name: db.getSetting('hub_name') || 'CAC Hub',
      nodes: nodeManager.getAllStatus(),
    });
  });

  // ── Node CRUD ──

  router.get('/api/nodes', (req, res) => {
    res.json(nodeManager.getAllStatus());
  });

  router.post('/api/nodes', (req, res) => {
    const { name, url, api_key, room } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const node = db.addNode({ name, url, api_key, room, model: '' });
    // Connect immediately
    nodeManager.connectNode(node);
    res.json(node);
  });

  router.get('/api/nodes/:id', (req, res) => {
    const node = db.getNode(parseInt(req.params.id));
    if (!node) return res.status(404).json({ error: 'Node not found' });
    const status = nodeManager.getNodeStatus(node.id);
    res.json({ ...node, api_key: undefined, ...status });
  });

  router.put('/api/nodes/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const node = db.updateNode(id, req.body);
    if (!node) return res.status(404).json({ error: 'Node not found' });

    // Reconnect if URL or API key changed
    if (req.body.url !== undefined || req.body.api_key !== undefined || req.body.enabled !== undefined) {
      if (node.enabled) {
        nodeManager.connectNode(node);
      } else {
        nodeManager.disconnectNode(id);
      }
    }
    res.json(node);
  });

  router.delete('/api/nodes/:id', (req, res) => {
    const id = parseInt(req.params.id);
    nodeManager.disconnectNode(id);
    db.deleteNode(id);
    res.json({ ok: true });
  });

  // ── Test Node Connection ──

  router.post('/api/nodes/test', async (req, res) => {
    const { url, api_key } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
      const cleanUrl = url.replace(/\/+$/, '');
      const resp = await fetch(`${cleanUrl}/api/node/info`, {
        headers: { 'X-API-Key': api_key || '' },
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        const text = await resp.text();
        return res.json({ ok: false, status: resp.status, error: text });
      }

      const data = await resp.json();
      res.json({ ok: true, data });
    } catch (err) {
      res.json({ ok: false, error: err.message });
    }
  });

  // ── Proxy API calls to Nodes ──

  router.all('/api/nodes/:id/proxy/{*path}', async (req, res) => {
    const nodeId = parseInt(req.params.id);
    const path = req.params.path;

    try {
      const result = await nodeManager.proxyRequest(nodeId, req.method, path, req.body);
      res.status(result.status).json(result.data);
    } catch (err) {
      res.status(502).json({ error: `Proxy error: ${err.message}` });
    }
  });

  // ── Proxy cover images from Nodes ──

  router.get('/api/nodes/:id/cover/{*path}', async (req, res) => {
    const nodeId = parseInt(req.params.id);
    const coverPath = 'covers/' + req.params.path;

    try {
      const result = await nodeManager.proxyBinary(nodeId, coverPath);
      if (!result) return res.status(404).end();
      res.set('Content-Type', result.contentType);
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(result.buffer);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // ── Hub Settings ──

  router.get('/api/settings', (req, res) => {
    res.json(db.getAllSettings());
  });

  router.put('/api/settings', (req, res) => {
    for (const [key, value] of Object.entries(req.body)) {
      db.setSetting(key, value);
    }
    res.json(db.getAllSettings());
  });

  return router;
}
