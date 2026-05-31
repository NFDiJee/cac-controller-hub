# CAC Hub - Installation Guide

Detailed step-by-step guide for installing the CAC Hub on a Raspberry Pi. The Hub is a central dashboard for controlling and monitoring multiple Pioneer CAC CD autochangers across the network.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Preparing the Raspberry Pi](#3-preparing-the-raspberry-pi)
4. [Installing Node.js](#4-installing-nodejs)
5. [Installing Build Tools](#5-installing-build-tools)
6. [Installing the CAC Hub](#6-installing-the-cac-hub)
7. [First Start and Testing](#7-first-start-and-testing)
8. [Adding Nodes](#8-adding-nodes)
9. [Setting Up the Systemd Service](#9-setting-up-the-systemd-service)
10. [Configuring Hub Settings](#10-configuring-hub-settings)
11. [Hub and Node on the Same Pi](#11-hub-and-node-on-the-same-pi)
12. [Setting Up Multiple Nodes](#12-setting-up-multiple-nodes)
13. [Updates](#13-updates)
14. [Troubleshooting](#14-troubleshooting)
15. [Uninstallation](#15-uninstallation)

---

## 1. Overview

### What is the CAC Hub?

The CAC Hub is a Node.js web application that connects via REST API and WebSocket to one or more [CAC Controller](https://github.com/NFDiJee/cac-controller) nodes. It provides:

- **Dashboard** — All changers at a glance with live status
- **Centralized Control** — Operate player, library, playlists, and scanner of each node
- **Real-time Updates** — WebSocket events from all nodes are aggregated and displayed live
- **Statistics** — Top tracks with covers, top CDs, top artists, genre distribution, and activity charts per node
- **Backup / Restore** — Full database export and import (JSON) and cover image export and import (ZIP) for each node
- **Proxy API** — All node functions are accessible through the Hub with automatic API key authentication

### Architecture

```
                    ┌──────────────────┐
                    │    CAC Hub       │
                    │  (this app)      │
                    │  Port 4000       │
                    └───┬────┬────┬───┘
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

### Important: Hub is Optional

Every node works fully on its own. The Hub is purely additive — it aggregates status and provides centralized control. If the Hub goes down, all nodes continue to operate unchanged.

---

## 2. Prerequisites

### Hardware

- **Raspberry Pi** — Recommended: Pi 3B+, Pi 4, Pi 5, or Zero 2 W
  - The Hub requires **no** serial port — only a network connection
  - Can run on the same Pi as a node (see Section 11)
  - Minimum 512 MB RAM
- **MicroSD Card** — Minimum 8 GB
- **Power Supply** — Appropriate USB power supply
- **Network Connection** — WiFi or Ethernet

### Software

- **Raspberry Pi OS** — Lite or Desktop (Debian Bookworm or newer)
- **SSH Access** — Enabled
- **Node.js** — Version 18 or newer (20 LTS recommended)
- **Internet Access** — For installation

### Network Requirements

- All CAC Controller nodes must be reachable via HTTP from the Hub
- Default ports: Node 3000, Hub 4000
- Recommended: Static IP addresses for all Raspberry Pis

### Node Requirements

- At least one configured [CAC Controller Node](https://github.com/NFDiJee/cac-controller)
- Each node must have an **API key** generated (see Section 8)

---

## 3. Preparing the Raspberry Pi

**Note:** If the Hub runs on the same Pi as a node that is already set up, this section can be skipped.

### 3.1 Installing the Operating System

1. Download **Raspberry Pi Imager**: https://www.raspberrypi.com/software/
2. Flash Raspberry Pi OS Lite (64-bit) to the MicroSD card
3. In the Imager under **Settings**:
   - Set hostname (e.g., `cac-hub`)
   - Enable SSH
   - Set username and password
   - Configure WiFi
   - Set timezone

### 3.2 Connect via SSH

```bash
ssh pi@<HUB_IP>
```

### 3.3 Update the System

```bash
sudo apt update && sudo apt upgrade -y
```

### 3.4 Configure Static IP Address (Recommended)

```bash
# Show current connection:
nmcli connection show

# Set static IP (example):
sudo nmcli connection modify "preconfigured" \
  ipv4.method manual \
  ipv4.addresses "192.168.1.200/24" \
  ipv4.gateway "192.168.1.1" \
  ipv4.dns "192.168.1.1"

# Restart connection:
sudo nmcli connection down "preconfigured"
sudo nmcli connection up "preconfigured"
```

### 3.5 Disable WiFi Power Saving (Recommended)

```bash
sudo tee /etc/NetworkManager/conf.d/wifi-powersave.conf > /dev/null << 'EOF'
[connection]
wifi.powersave = 2
EOF
sudo systemctl restart NetworkManager
```

---

## 4. Installing Node.js

**Note:** If Node.js is already installed for a CAC Controller node, this step can be skipped.

### 4.1 Install Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 4.2 Verify Installation

```bash
node --version   # Minimum v18.x
npm --version
```

---

## 5. Installing Build Tools

For the native SQLite extension (`better-sqlite3`):

```bash
sudo apt install -y build-essential python3
```

---

## 6. Installing the CAC Hub

### Option A: From GitHub (Recommended)

```bash
cd /opt
sudo git clone https://github.com/NFDiJee/cac-controller-hub.git
sudo chown -R pi:pi /opt/cac-controller-hub
cd /opt/cac-controller-hub
npm install
```

### Option B: Manual Copy

```bash
# On your local machine:
scp -r ./cac-controller-hub/* pi@<HUB_IP>:/opt/cac-controller-hub/

# On the Raspberry Pi:
cd /opt/cac-controller-hub
npm install
```

### Verify Installation

```bash
ls -la /opt/cac-controller-hub/
# Should contain: server.js, package.json, src/, public/, ...

ls -la /opt/cac-controller-hub/node_modules/
# Should show installed packages
```

---

## 7. First Start and Testing

### 7.1 Start the Server Manually

```bash
cd /opt/cac-controller-hub
node server.js
```

Expected output:
```
[Hub] Initializing database...
[NodeManager] Connecting to 0 nodes...
[Hub] CAC Hub running on http://0.0.0.0:4000
```

### 7.2 Open in Browser

```
http://<HUB_IP>:4000
```

You should see the Hub dashboard — still empty since no nodes are configured. The dashboard shows:
- Empty node card view
- Navigation: Dashboard, Settings
- Language toggle (DE/EN)

### 7.3 Stop the Server

Press `Ctrl+C` in the terminal.

---

## 8. Adding Nodes

### 8.1 Generate API Key on the Node

Before a node can be registered in the Hub, it must have an API key:

1. Open the node's web interface: `http://<NODE_IP>:3000`
2. Under **Settings**, open the **Hub / Network** section
3. Enter a **Node Name** (e.g., "Living Room")
4. Enter a **Room** (e.g., "Ground Floor")
5. Click **Generate API Key**
6. **Copy** the generated key (needed in the Hub)
7. Click **Save**

### 8.2 Add Node in the Hub

1. Open the Hub in browser: `http://<HUB_IP>:4000`
2. Switch to **Settings**
3. In the **Add Node** section:
   - **URL**: `http://<NODE_IP>:3000` (full URL with port)
   - **API Key**: Paste the copied API key
4. Click **Test Connection**
   - On success: **Name**, **Room**, and **Model** are auto-filled
   - On failure: Check URL and key, test network connectivity
5. Click **Add**

### 8.3 Configure GPIO Pin (optional)

If the node has a relay connection for powering the CAC unit:

1. In the Hub under **Settings**, find the node entry and click **Edit** (pencil icon)
2. Enter the BCM pin number in the **GPIO Pin (Relay)** field (e.g., `17`)
3. Click **Save** — the pin is automatically written to the node's settings
4. A power button appears in the node card header on the dashboard

### 8.4 Verify Connection

After adding:
- The node should appear on the dashboard as **Online** (green dot)
- Player status cards should show the current state of the node
- Quick controls (Play, Pause, Stop, Next) should work
- If GPIO configured: The power button in the card header should show relay status (red = OFF, green = ON)

### 8.5 Test Connection via Command Line

If the Hub UI doesn't work, test the connection manually:

```bash
# From the Hub Pi:
curl -H "X-API-Key: YOUR_API_KEY" http://<NODE_IP>:3000/api/node/info
```

Expected response:
```json
{
  "name": "Living Room",
  "room": "Ground Floor",
  "model": "CAC-V3000",
  "version": "1.0.0"
}
```

If no response: check network connectivity, firewall rules, node service status.

---

## 9. Setting Up the Systemd Service

### 9.1 Copy Service File

```bash
sudo cp /opt/cac-controller-hub/cac-hub.service /etc/systemd/system/
```

### 9.2 Adjust Service File (If Needed)

```bash
sudo nano /etc/systemd/system/cac-hub.service
```

Contents:
```ini
[Unit]
Description=CAC Hub - Central Dashboard for Pioneer CD Autochanger Nodes
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/cac-controller-hub
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Change `User=` to the correct user if not `pi`.

### 9.3 Enable and Start the Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable cac-hub
sudo systemctl start cac-hub
```

### 9.4 Check Status

```bash
sudo systemctl status cac-hub
```

### 9.5 View Logs

```bash
# Live logs:
sudo journalctl -u cac-hub -f

# Last 50 lines:
sudo journalctl -u cac-hub --no-pager -n 50
```

### 9.6 Test Autostart

```bash
sudo reboot
```

After reboot: `http://<HUB_IP>:4000` should be accessible and all nodes should connect automatically.

---

## 10. Configuring Hub Settings

In the browser under **Settings** (on the Hub):

### 10.1 General

| Setting | Default | Description |
|---------|---------|-------------|
| Hub Name | `CAC Hub` | Display name in browser tab and header |
| Language | `auto` | Automatic (by browser language), German, or English |

### 10.2 Network

| Setting | Default | Description |
|---------|---------|-------------|
| Port | `4000` | HTTP server port (restart service after change) |

### 10.3 Connection

| Setting | Default | Description |
|---------|---------|-------------|
| Reconnect Interval | `10000` ms | Wait time between reconnection attempts |
| Health Check Interval | `30000` ms | Interval for periodic status polling |

### 10.4 Apply Changes

Port changes require a service restart:

```bash
sudo systemctl restart cac-hub
```

Language and name changes take effect immediately.

---

## 11. Hub and Node on the Same Pi

The Hub can easily run on the same Raspberry Pi as a CAC Controller node. This is the simplest configuration for small setups.

### Port Configuration

- **Node**: Port 3000 (default)
- **Hub**: Port 4000 (default)
- Both run in parallel without conflicts

### Set Up Both Services

```bash
# If not already done — Node service:
sudo systemctl enable cac-controller
sudo systemctl start cac-controller

# Hub service:
sudo systemctl enable cac-hub
sudo systemctl start cac-hub
```

### Connect Node via localhost

Add the node in the Hub with:
- **URL**: `http://localhost:3000`
- **API Key**: The key generated on the node

### Resource Usage

Both applications together require:
- Approx. 80-120 MB RAM
- Minimal CPU load (Raspberry Pi 3 or newer is sufficient)

---

## 12. Setting Up Multiple Nodes

### 12.1 Network Planning

For a multi-node setup, consider:

| Device | IP Address | Port | Hostname |
|--------|-----------|------|----------|
| Hub | 192.168.1.200 | 4000 | cac-hub |
| Node Living Room | 192.168.1.101 | 3000 | cac-livingroom |
| Node Studio | 192.168.1.102 | 3000 | cac-studio |
| Node Bar | 192.168.1.103 | 3000 | cac-bar |

### 12.2 Order of Setup

1. Install and configure all nodes (see [CAC Controller Installation Guide](https://github.com/NFDiJee/cac-controller))
2. Generate an API key on each node
3. Install the Hub
4. Add all nodes in the Hub

### 12.3 Ordering

Nodes are displayed on the dashboard in the order they were added. The order can be adjusted via the `sort_order` field in the database.

---

## 13. Updates

### From GitHub Repository

```bash
cd /opt/cac-controller-hub
git pull
npm install
sudo systemctl restart cac-hub
```

### Manual Update

1. Copy new files to the Pi
2. Run `npm install`
3. Restart service: `sudo systemctl restart cac-hub`

### After an Update

- All node connections are automatically restored
- The Hub database (node configurations) is preserved
- Settings are preserved

---

## 14. Troubleshooting

### 14.1 Hub Does Not Start

```bash
# Check logs:
sudo journalctl -u cac-hub --no-pager -n 50

# Start manually for details:
cd /opt/cac-controller-hub && node server.js
```

**Common causes:**
- Port 4000 in use: `sudo lsof -i :4000`
- Missing node_modules: run `npm install` again
- Wrong user in service: check `User=` in the service file

### 14.2 Node Not Reachable

```bash
# Test from Hub Pi:
curl -H "X-API-Key: YOUR_KEY" http://<NODE_IP>:3000/api/node/info

# Ping test:
ping <NODE_IP>

# Port test:
nc -zv <NODE_IP> 3000
```

**Common causes:**
- Node service not running: check `sudo systemctl status cac-controller` on the node
- Wrong API key
- Firewall blocking port 3000
- WiFi power saving on node or Hub

### 14.3 Node Shows "Offline" on Dashboard

- **Brief outage:** The Hub automatically retries connection every 10 seconds
- **Permanently offline:** Check URL and API key in Hub, check node service
- **Health check failed:** Check network connectivity

### 14.4 WebSocket Connection Drops

WebSocket connections can be interrupted by network timeouts. The Hub has three safeguards:

1. **Auto-Reconnect** — Automatically reconnects (every 10s)
2. **Health Checks** — REST API polling as backup (every 30s)
3. **Hub UI Reconnect** — Browser client reconnects automatically

### 14.5 Port 4000 in Use

```bash
# Find the process:
sudo lsof -i :4000

# Choose a different port in Hub settings
# Then restart service:
sudo systemctl restart cac-hub
```

### 14.6 Proxy Error (502 Bad Gateway)

When Hub commands to nodes fail:

```bash
# Test directly at the node (without Hub):
curl http://<NODE_IP>:3000/api/player/1/status

# Test with API key:
curl -H "X-API-Key: KEY" http://<NODE_IP>:3000/api/player/1/status
```

**Cause:** Node is unreachable or the API key is incorrect.

### 14.7 Cover Images Not Displayed

Cover images are loaded via the Hub proxy. If they are missing:

1. Check directly on the node: `http://<NODE_IP>:3000` — are covers visible there?
2. Test proxy: `http://<HUB_IP>:4000/api/nodes/1/cover/cover_1.jpg`

---

## 15. Uninstallation

### Remove Service

```bash
sudo systemctl stop cac-hub
sudo systemctl disable cac-hub
sudo rm /etc/systemd/system/cac-hub.service
sudo systemctl daemon-reload
```

### Delete Files

```bash
sudo rm -rf /opt/cac-controller-hub
```

### Remove Node.js (Only if no Node Runs on This Pi)

```bash
sudo apt purge -y nodejs
```

---

*CAC Hub v1.0.0 — Copyright (c) 2025 Dirk Jensen*
*MIT License*
