import express from 'express';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, getSetting } from './src/database.js';
import { NodeManager } from './src/node-manager.js';
import { createRoutes } from './src/routes.js';
import { HubWebSocket } from './src/websocket.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize database
console.log('[Hub] Initializing database...');
initDatabase();

// Initialize node manager
const nodeManager = new NodeManager();

// Setup Express
const app = express();
const server = createServer(app);

app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, 'public')));

// API routes
app.use(createRoutes(nodeManager));

// SPA fallback
app.get('{*path}', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Setup WebSocket
const hubWs = new HubWebSocket(server, nodeManager);

// Start
const port = parseInt(getSetting('hub_port')) || 4000;
server.listen(port, '0.0.0.0', () => {
  console.log(`[Hub] CAC Hub running on http://0.0.0.0:${port}`);
});

// Connect to all nodes
nodeManager.connectAll();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Hub] Shutting down...');
  nodeManager.disconnectAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  nodeManager.disconnectAll();
  process.exit(0);
});
