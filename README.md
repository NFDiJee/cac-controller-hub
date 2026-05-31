# CAC Hub

A central dashboard for managing multiple **Pioneer CAC CD Autochanger** nodes across your network.

The CAC Hub connects to one or more [CAC Controller](https://github.com/NFDiJee/cac-controller) nodes via REST API and WebSocket, providing a unified interface for monitoring and controlling all your CD autochangers from a single location.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.x-green.svg)

## Overview

```
                    ┌──────────────────┐
                    │    CAC Hub        │
                    │  (this app)       │
                    │  Port 4000        │
                    └───┬────┬────┬────┘
          REST API +    │    │    │    REST API +
          WebSocket     │    │    │    WebSocket
        ┌───────────────┘    │    └───────────────┐
        v                    v                    v
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  Living Room  │  │    Studio     │  │      Bar      │
│  CAC-V3000    │  │  CAC-V5000    │  │  CAC-V180M    │
│  RPi + Node   │  │  RPi + Node   │  │  RPi + Node   │
│  Port 3000    │  │  Port 3000    │  │  Port 3000    │
└───────────────┘  └───────────────┘  └───────────────┘
```

Each node runs the standalone [CAC Controller](https://github.com/NFDiJee/cac-controller) app and remains fully operational on its own. The Hub is purely additive — it aggregates status and provides centralized control.

## Features

### Dashboard
- **Live node status cards** with real-time player state, disc, track, and mode for all connected nodes
- **Quick controls** — Play, Pause, Stop, Next directly from the dashboard
- **Power control** — On/Off button per node (GPIO relay) in the card header, configurable per node
- **Connection monitoring** with automatic reconnect and health checks

### Node Control
- **Full player control** — Transport (play, pause, stop, next, previous), volume, speed for both players
- **Play modes** — Continuous, Gapless, Shuffle
- **Library browser** — Search, browse, and load CDs from any node
- **Playlists** — View and start playlists on any node
- **Scanner** — Start/abort CD scans remotely with live progress
- **Statistics** — Play statistics per node with top tracks (with covers), top CDs, top artists, genre distribution, and activity charts
- **Backup / Restore** — Export and import full node database backups (JSON) and cover images (ZIP) via the Hub
- **Direct link** to each node's full web interface for advanced features

### Management
- **Add/remove nodes** with URL and API key
- **Test connection** before adding a node (auto-fills name, room, model)
- **GPIO pin configuration** per node in the edit modal (proxied to node settings)
- **Hub settings** — Name, port, language
- **Bilingual UI** — German and English

### Technical
- **Proxy API** — All requests to nodes are proxied through the Hub with API key authentication
- **WebSocket aggregation** — Real-time events from all nodes are merged and forwarded to Hub clients
- **Cover image proxy** — Album covers from nodes are served through the Hub
- **Auto-reconnect** — Lost node connections are automatically retried
- **Health checks** — Periodic status polling to detect offline nodes

## Prerequisites

- **Node.js** >= 18.x (20 LTS recommended)
- **npm** (included with Node.js)
- **Build tools** for native SQLite module: `build-essential`, `python3`
- One or more [CAC Controller](https://github.com/NFDiJee/cac-controller) nodes configured with API keys

## Quick Start

```bash
git clone https://github.com/NFDiJee/cac-controller-hub.git
cd cac-controller-hub
npm install
npm start
```

Open `http://<your-ip>:4000` in any browser.

## Node Setup

Each CAC Controller node must have an API key configured for the Hub to connect:

1. Open the node's web interface (`http://<node-ip>:3000`)
2. Go to **Settings** (gear icon)
3. Under **Hub / Network**, set:
   - **Node Name** (e.g., "Living Room")
   - **Room** (e.g., "Ground Floor")
   - **API Key** — Click "Generate" for a random 32-character key
4. Save settings

Then add the node in the Hub under **Settings > Add Node**:
- **URL**: `http://<node-ip>:3000`
- **API Key**: The key you generated on the node
- Click **Test Connection** to verify, then **Add**

## REST API

### Hub Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/hub/status` | Hub overview with all nodes |
| `GET` | `/api/nodes` | List all nodes with status |
| `POST` | `/api/nodes` | Add a node `{ url, api_key, name, room }` |
| `GET` | `/api/nodes/:id` | Get single node status |
| `PUT` | `/api/nodes/:id` | Update node |
| `DELETE` | `/api/nodes/:id` | Remove node |
| `POST` | `/api/nodes/test` | Test connection `{ url, api_key }` |

### Proxy Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `ALL` | `/api/nodes/:id/proxy/*` | Proxy any API call to a node |
| `GET` | `/api/nodes/:id/cover/*` | Proxy cover images from a node |
| `GET` | `/api/nodes/:id/proxy/backup/covers` | Download cover images ZIP from a node |
| `POST` | `/api/nodes/:id/proxy/backup/covers` | Upload cover images ZIP to a node |

The proxy automatically adds the stored API key to forwarded requests. Any endpoint available on the node can be called through the proxy — player control, library CRUD, playlists, scanner, settings, MusicBrainz, and more. Binary content (cover images, ZIP archives) is proxied via dedicated routes.

### Hub Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/settings` | Get hub settings |
| `PUT` | `/api/settings` | Update hub settings |

### WebSocket

Connect to `ws://<hub>:4000` for real-time updates from all nodes:

| Message Type | Description |
|--------------|-------------|
| `init` | Initial state with all nodes |
| `nodeOnline` | A node connected |
| `nodeOffline` | A node disconnected |
| `nodeState` | Full state update from a node |
| `nodeEvent` | Forwarded event from a node (playerState, scanProgress, etc.) |

## Project Structure

```
cac-controller-hub/
├── server.js                 # Express + WebSocket server (port 4000)
├── package.json
├── cac-hub.service           # Systemd unit file
├── src/
│   ├── database.js           # SQLite database (nodes, settings)
│   ├── node-manager.js       # WebSocket connections to nodes, health checks
│   ├── routes.js             # Hub API + proxy routes
│   └── websocket.js          # WebSocket for Hub UI clients
├── public/
│   ├── index.html            # Hub SPA (dashboard, node control, settings)
│   ├── css/
│   │   └── app.css           # Dark theme styling
│   └── js/
│       ├── app.js            # Hub frontend logic
│       └── i18n.js           # Translations (DE/EN)
└── data/
    └── cac-hub.db            # SQLite database (auto-created)
```

## Installation on Raspberry Pi

See [INSTALL.md](INSTALL.md) for step-by-step instructions.

The Hub can run on the same Raspberry Pi as a node, or on a separate device. Use a different port (default: 4000) to avoid conflicts.

## Configuration

All settings are configurable via the web UI under **Settings**:

| Setting | Default | Description |
|---------|---------|-------------|
| Hub Name | `CAC Hub` | Display name |
| Port | `4000` | HTTP server port |
| Language | `auto` | Auto-detect, German, or English |
| Reconnect Interval | `10000` | ms between reconnect attempts |
| Health Check Interval | `30000` | ms between health checks |

## Updating

```bash
cd /opt/cac-controller-hub
git pull
npm install
sudo systemctl restart cac-hub
```

## License

MIT License — Copyright (c) 2025 Dirk Jensen — See [LICENSE](LICENSE) for details.

## Related

- [CAC Controller (Node)](https://github.com/NFDiJee/cac-controller) — The standalone controller for each Pioneer CAC autochanger

## Disclaimer

This is an independent open-source project. It is not affiliated with, endorsed by, or connected to Pioneer Corporation or any of its subsidiaries. "Pioneer" and "CAC" are trademarks of Pioneer Corporation.
