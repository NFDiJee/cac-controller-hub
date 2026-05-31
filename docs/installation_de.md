# CAC Hub - Installationsanleitung

Detaillierte Schritt-fuer-Schritt-Anleitung zur Installation des CAC Hub auf einem Raspberry Pi. Der Hub ist ein zentrales Dashboard zur Steuerung und Ueberwachung mehrerer Pioneer CAC CD-Automatenwechsler im Netzwerk.

---

## Inhaltsverzeichnis

1. [Uebersicht](#1-uebersicht)
2. [Voraussetzungen](#2-voraussetzungen)
3. [Raspberry Pi vorbereiten](#3-raspberry-pi-vorbereiten)
4. [Node.js installieren](#4-nodejs-installieren)
5. [Build-Tools installieren](#5-build-tools-installieren)
6. [CAC Hub installieren](#6-cac-hub-installieren)
7. [Erster Start und Test](#7-erster-start-und-test)
8. [Nodes hinzufuegen](#8-nodes-hinzufuegen)
9. [Systemd-Service einrichten](#9-systemd-service-einrichten)
10. [Hub-Einstellungen konfigurieren](#10-hub-einstellungen-konfigurieren)
11. [Hub und Node auf demselben Pi](#11-hub-und-node-auf-demselben-pi)
12. [Mehrere Nodes einrichten](#12-mehrere-nodes-einrichten)
13. [Updates](#13-updates)
14. [Fehlerbehebung](#14-fehlerbehebung)
15. [Deinstallation](#15-deinstallation)

---

## 1. Uebersicht

### Was ist der CAC Hub?

Der CAC Hub ist eine Node.js-Webanwendung, die sich per REST-API und WebSocket mit einem oder mehreren [CAC Controller](https://github.com/NFDiJee/cac-controller)-Nodes verbindet. Er bietet:

- **Dashboard** — Alle Wechsler auf einen Blick mit Live-Status
- **Zentrale Steuerung** — Player, Library, Playlists und Scanner jedes Nodes bedienen
- **Echtzeit-Updates** — WebSocket-Events aller Nodes werden aggregiert und live angezeigt
- **Statistiken** — Top-Tracks mit Covers, Top-CDs, Top-Kuenstler, Genre-Verteilung und Aktivitaets-Diagramme pro Node
- **Backup / Restore** — Vollstaendiger Datenbank-Export und -Import (JSON) sowie Cover-Bilder-Export und -Import (ZIP) fuer jeden Node
- **Proxy-API** — Alle Node-Funktionen sind ueber den Hub erreichbar, mit automatischer API-Key-Authentifizierung

### Architektur

```
                    ┌──────────────────┐
                    │    CAC Hub       │
                    │  (diese App)     │
                    │  Port 4000       │
                    └───┬────┬────┬───┘
          REST API +    │    │    │    REST API +
          WebSocket     │    │    │    WebSocket
        ┌───────────────┘    │    └───────────────┐
        v                    v                    v
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  Wohnzimmer   │  │    Studio     │  │      Bar      │
│  CAC-V3000    │  │  CAC-V5000    │  │  CAC-V180M    │
│  RPi + Node   │  │  RPi + Node   │  │  RPi + Node   │
│  Port 3000    │  │  Port 3000    │  │  Port 3000    │
└───────────────┘  └───────────────┘  └───────────────┘
```

### Wichtig: Hub ist optional

Jeder Node funktioniert vollstaendig eigenstaendig. Der Hub ist rein additiv — er aggregiert Status und bietet zentralisierte Steuerung. Falls der Hub ausfaellt, laufen alle Nodes unveraendert weiter.

---

## 2. Voraussetzungen

### Hardware

- **Raspberry Pi** — Empfohlen: Pi 3B+, Pi 4, Pi 5 oder Zero 2 W
  - Der Hub benoetigt **keinen** seriellen Anschluss — nur Netzwerk
  - Kann auf demselben Pi wie ein Node laufen (siehe Abschnitt 11)
  - Mindestens 512 MB RAM
- **MicroSD-Karte** — Mindestens 8 GB
- **Netzteil** — Passendes USB-Netzteil
- **Netzwerkverbindung** — WLAN oder Ethernet

### Software

- **Raspberry Pi OS** — Lite oder Desktop (Debian Bookworm oder neuer)
- **SSH-Zugang** — Aktiviert
- **Node.js** — Version 18 oder neuer (20 LTS empfohlen)
- **Internetzugang** — Fuer die Installation

### Netzwerk-Voraussetzungen

- Alle CAC Controller Nodes muessen vom Hub aus per HTTP erreichbar sein
- Standard-Ports: Node 3000, Hub 4000
- Empfohlen: Statische IP-Adressen fuer alle Raspberry Pis

### Node-Voraussetzungen

- Mindestens ein konfigurierter [CAC Controller Node](https://github.com/NFDiJee/cac-controller)
- Auf jedem Node muss ein **API-Key** generiert sein (siehe Abschnitt 8)

---

## 3. Raspberry Pi vorbereiten

**Hinweis:** Falls der Hub auf demselben Pi wie ein Node laeuft und dieser bereits eingerichtet ist, kann dieser Abschnitt uebersprungen werden.

### 3.1 Betriebssystem installieren

1. **Raspberry Pi Imager** herunterladen: https://www.raspberrypi.com/software/
2. Raspberry Pi OS Lite (64-bit) auf die MicroSD-Karte schreiben
3. Im Imager unter **Einstellungen**:
   - Hostname setzen (z.B. `cac-hub`)
   - SSH aktivieren
   - Benutzername und Passwort setzen
   - WLAN konfigurieren
   - Zeitzone setzen

### 3.2 Per SSH verbinden

```bash
ssh pi@<HUB_IP>
```

### 3.3 System aktualisieren

```bash
sudo apt update && sudo apt upgrade -y
```

### 3.4 Statische IP-Adresse konfigurieren (empfohlen)

```bash
# Aktuelle Verbindung anzeigen:
nmcli connection show

# Statische IP setzen (Beispiel):
sudo nmcli connection modify "preconfigured" \
  ipv4.method manual \
  ipv4.addresses "192.168.1.200/24" \
  ipv4.gateway "192.168.1.1" \
  ipv4.dns "192.168.1.1"

# Verbindung neu starten:
sudo nmcli connection down "preconfigured"
sudo nmcli connection up "preconfigured"
```

### 3.5 WLAN-Stromsparmodus deaktivieren (empfohlen)

```bash
sudo tee /etc/NetworkManager/conf.d/wifi-powersave.conf > /dev/null << 'EOF'
[connection]
wifi.powersave = 2
EOF
sudo systemctl restart NetworkManager
```

---

## 4. Node.js installieren

**Hinweis:** Falls Node.js bereits fuer einen CAC Controller Node installiert ist, kann dieser Schritt uebersprungen werden.

### 4.1 Node.js 20 LTS installieren

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 4.2 Installation pruefen

```bash
node --version   # Mindestens v18.x
npm --version
```

---

## 5. Build-Tools installieren

Fuer die native SQLite-Erweiterung (`better-sqlite3`):

```bash
sudo apt install -y build-essential python3
```

---

## 6. CAC Hub installieren

### Option A: Von GitHub (empfohlen)

```bash
cd /opt
sudo git clone https://github.com/NFDiJee/cac-controller-hub.git
sudo chown -R pi:pi /opt/cac-controller-hub
cd /opt/cac-controller-hub
npm install
```

### Option B: Manuell kopieren

```bash
# Auf dem lokalen Rechner:
scp -r ./cac-controller-hub/* pi@<HUB_IP>:/opt/cac-controller-hub/

# Auf dem Raspberry Pi:
cd /opt/cac-controller-hub
npm install
```

### Installation pruefen

```bash
ls -la /opt/cac-controller-hub/
# Sollte enthalten: server.js, package.json, src/, public/, ...

ls -la /opt/cac-controller-hub/node_modules/
# Sollte die installierten Pakete zeigen
```

---

## 7. Erster Start und Test

### 7.1 Server manuell starten

```bash
cd /opt/cac-controller-hub
node server.js
```

Erwartete Ausgabe:
```
[Hub] Initializing database...
[NodeManager] Connecting to 0 nodes...
[Hub] CAC Hub running on http://0.0.0.0:4000
```

### 7.2 Im Browser oeffnen

```
http://<HUB_IP>:4000
```

Du solltest das Hub Dashboard sehen — noch leer, da keine Nodes konfiguriert sind. Das Dashboard zeigt:
- Leere Node-Karten-Ansicht
- Navigation: Dashboard, Einstellungen
- Sprachumschaltung (DE/EN)

### 7.3 Server stoppen

Im Terminal `Ctrl+C` druecken.

---

## 8. Nodes hinzufuegen

### 8.1 API-Key auf dem Node generieren

Bevor ein Node im Hub registriert werden kann, muss auf dem Node ein API-Key vorhanden sein:

1. Die Web-Oberflaeche des Nodes oeffnen: `http://<NODE_IP>:3000`
2. Unter **Einstellungen** den Abschnitt **Hub / Netzwerk** oeffnen
3. **Node-Name** eingeben (z.B. "Wohnzimmer")
4. **Raum** eingeben (z.B. "Erdgeschoss")
5. **API-Key generieren** klicken
6. Den generierten Key **kopieren** (wird im Hub benoetigt)
7. **Speichern** klicken

### 8.2 Node im Hub hinzufuegen

1. Hub im Browser oeffnen: `http://<HUB_IP>:4000`
2. Auf **Einstellungen** wechseln
3. Im Bereich **Node hinzufuegen**:
   - **URL**: `http://<NODE_IP>:3000` (die vollstaendige URL mit Port)
   - **API-Key**: Den kopierten API-Key einfuegen
4. **Verbindung testen** klicken
   - Bei Erfolg werden **Name**, **Raum** und **Modell** automatisch uebernommen
   - Bei Fehler: URL und Key pruefen, Netzwerkverbindung testen
5. **Hinzufuegen** klicken

### 8.3 GPIO-Pin konfigurieren (optional)

Falls der Node einen Relais-Anschluss fuer die Stromsteuerung des CAC hat:

1. Im Hub unter **Einstellungen** den Node-Eintrag finden und auf **Bearbeiten** (Stift-Symbol) klicken
2. Im Feld **GPIO-Pin (Relais)** den BCM-Pin eingeben (z.B. `17`)
3. **Speichern** klicken — der Pin wird automatisch in die Node-Einstellungen geschrieben
4. Auf dem Dashboard erscheint ein Power-Button neben dem Status-Punkt des Nodes

### 8.4 Verbindung pruefen

Nach dem Hinzufuegen:
- Der Node sollte auf dem Dashboard als **Online** (gruener Punkt) erscheinen
- Die Player-Status-Karten sollten den aktuellen Zustand des Nodes anzeigen
- Quick-Controls (Play, Pause, Stop, Next) sollten funktionieren
- Falls GPIO konfiguriert: Der Power-Button im Karten-Header sollte den Relais-Status anzeigen (rot = AUS, gruen = EIN)

### 8.5 Verbindung per Kommandozeile testen

Falls die Hub-UI nicht funktioniert, kann die Verbindung manuell getestet werden:

```bash
# Vom Hub-Pi aus:
curl -H "X-API-Key: DEIN_API_KEY" http://<NODE_IP>:3000/api/node/info
```

Erwartete Antwort:
```json
{
  "name": "Wohnzimmer",
  "room": "Erdgeschoss",
  "model": "CAC-V3000",
  "version": "1.0.0"
}
```

Falls keine Antwort: Netzwerkverbindung pruefen, Firewall-Regeln pruefen, Node-Service-Status pruefen.

---

## 9. Systemd-Service einrichten

### 9.1 Service-Datei kopieren

```bash
sudo cp /opt/cac-controller-hub/cac-hub.service /etc/systemd/system/
```

### 9.2 Service-Datei anpassen (falls noetig)

```bash
sudo nano /etc/systemd/system/cac-hub.service
```

Inhalt:
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

`User=` auf den richtigen Benutzer aendern, falls nicht `pi`.

### 9.3 Service aktivieren und starten

```bash
sudo systemctl daemon-reload
sudo systemctl enable cac-hub
sudo systemctl start cac-hub
```

### 9.4 Status pruefen

```bash
sudo systemctl status cac-hub
```

### 9.5 Logs anzeigen

```bash
# Live-Logs:
sudo journalctl -u cac-hub -f

# Letzte 50 Zeilen:
sudo journalctl -u cac-hub --no-pager -n 50
```

### 9.6 Autostart testen

```bash
sudo reboot
```

Nach dem Neustart: `http://<HUB_IP>:4000` sollte erreichbar sein und alle Nodes automatisch verbinden.

---

## 10. Hub-Einstellungen konfigurieren

Im Browser unter **Einstellungen** (auf dem Hub):

### 10.1 Allgemein

| Einstellung | Standard | Beschreibung |
|-------------|----------|--------------|
| Hub-Name | `CAC Hub` | Anzeigename im Browser-Tab und Header |
| Sprache | `auto` | Automatisch (nach Browser-Sprache), Deutsch oder Englisch |

### 10.2 Netzwerk

| Einstellung | Standard | Beschreibung |
|-------------|----------|--------------|
| Port | `4000` | HTTP-Server-Port (nach Aenderung: Service neu starten) |

### 10.3 Verbindung

| Einstellung | Standard | Beschreibung |
|-------------|----------|--------------|
| Reconnect-Intervall | `10000` ms | Wartezeit zwischen Wiederverbindungsversuchen |
| Health-Check-Intervall | `30000` ms | Intervall fuer periodische Status-Abfragen |

### 10.4 Aenderungen uebernehmen

Port-Aenderungen erfordern einen Service-Neustart:

```bash
sudo systemctl restart cac-hub
```

Sprache und Name werden sofort uebernommen.

---

## 11. Hub und Node auf demselben Pi

Der Hub kann problemlos auf demselben Raspberry Pi wie ein CAC Controller Node laufen. Dies ist die einfachste Konfiguration fuer kleine Setups.

### Port-Konfiguration

- **Node**: Port 3000 (Standard)
- **Hub**: Port 4000 (Standard)
- Beide laufen parallel ohne Konflikte

### Beide Services einrichten

```bash
# Falls noch nicht geschehen — Node-Service:
sudo systemctl enable cac-controller
sudo systemctl start cac-controller

# Hub-Service:
sudo systemctl enable cac-hub
sudo systemctl start cac-hub
```

### Node mit localhost verbinden

Den Node im Hub hinzufuegen mit:
- **URL**: `http://localhost:3000`
- **API-Key**: Der auf dem Node generierte Key

### Ressourcen-Verbrauch

Beide Anwendungen zusammen benoetigen:
- Ca. 80-120 MB RAM
- Minimale CPU-Last (Raspberry Pi 3 oder neuer genuegt)

---

## 12. Mehrere Nodes einrichten

### 12.1 Netzwerk-Planung

Fuer ein Setup mit mehreren Nodes empfiehlt sich:

| Geraet | IP-Adresse | Port | Hostname |
|--------|-----------|------|----------|
| Hub | 192.168.1.200 | 4000 | cac-hub |
| Node Wohnzimmer | 192.168.1.101 | 3000 | cac-wohnzimmer |
| Node Studio | 192.168.1.102 | 3000 | cac-studio |
| Node Bar | 192.168.1.103 | 3000 | cac-bar |

### 12.2 Reihenfolge

1. Alle Nodes installieren und konfigurieren (siehe [CAC Controller Installationsanleitung](https://github.com/NFDiJee/cac-controller))
2. Auf jedem Node einen API-Key generieren
3. Hub installieren
4. Alle Nodes im Hub hinzufuegen

### 12.3 Sortierung

Nodes werden auf dem Dashboard in der Reihenfolge angezeigt, in der sie hinzugefuegt wurden. Die Reihenfolge kann ueber das `sort_order`-Feld in der Datenbank angepasst werden.

---

## 13. Updates

### Vom GitHub-Repository

```bash
cd /opt/cac-controller-hub
git pull
npm install
sudo systemctl restart cac-hub
```

### Manuell

1. Neue Dateien auf den Pi kopieren
2. `npm install` ausfuehren
3. Service neu starten: `sudo systemctl restart cac-hub`

### Nach einem Update

- Alle Node-Verbindungen werden automatisch wiederhergestellt
- Die Hub-Datenbank (Node-Konfigurationen) bleibt erhalten
- Einstellungen bleiben erhalten

---

## 14. Fehlerbehebung

### 14.1 Hub startet nicht

```bash
# Logs pruefen:
sudo journalctl -u cac-hub --no-pager -n 50

# Manuell starten fuer Details:
cd /opt/cac-controller-hub && node server.js
```

**Haeufige Ursachen:**
- Port 4000 belegt: `sudo lsof -i :4000`
- Fehlende node_modules: `npm install` erneut ausfuehren
- Falscher Benutzer im Service: `User=` in der Service-Datei pruefen

### 14.2 Node nicht erreichbar

```bash
# Vom Hub-Pi aus testen:
curl -H "X-API-Key: DEIN_KEY" http://<NODE_IP>:3000/api/node/info

# Ping testen:
ping <NODE_IP>

# Port testen:
nc -zv <NODE_IP> 3000
```

**Haeufige Ursachen:**
- Node-Service laeuft nicht: `sudo systemctl status cac-controller` auf dem Node pruefen
- Falscher API-Key
- Firewall blockiert Port 3000
- WLAN-Stromsparmodus auf Node oder Hub

### 14.3 Node zeigt "Offline" im Dashboard

- **Kurzer Ausfall:** Der Hub versucht automatisch alle 10 Sekunden eine Wiederverbindung
- **Dauerhaft offline:** URL und API-Key im Hub pruefen, Node-Service pruefen
- **Health-Check fehlgeschlagen:** Netzwerkverbindung pruefen

### 14.4 WebSocket-Verbindung bricht ab

WebSocket-Verbindungen koennen durch Netzwerk-Timeouts unterbrochen werden. Der Hub hat drei Sicherheitsmechanismen:

1. **Auto-Reconnect** — Verbindet automatisch wieder (alle 10s)
2. **Health-Checks** — REST-API-Polling als Backup (alle 30s)
3. **Hub-UI-Reconnect** — Browser-Client verbindet sich automatisch wieder

### 14.5 Port 4000 belegt

```bash
# Prozess finden:
sudo lsof -i :4000

# Anderen Port in den Hub-Einstellungen waehlen
# Dann Service neu starten:
sudo systemctl restart cac-hub
```

### 14.6 Proxy-Fehler (502 Bad Gateway)

Wenn Hub-Befehle an Nodes fehlschlagen:

```bash
# Direkt am Node testen (ohne Hub):
curl http://<NODE_IP>:3000/api/player/1/status

# Mit API-Key testen:
curl -H "X-API-Key: KEY" http://<NODE_IP>:3000/api/player/1/status
```

**Ursache:** Node ist nicht erreichbar oder der API-Key ist falsch.

### 14.7 Cover-Bilder werden nicht angezeigt

Cover-Bilder werden ueber den Hub-Proxy geladen. Falls sie fehlen:

1. Direkt auf dem Node pruefen: `http://<NODE_IP>:3000` — sind Covers dort sichtbar?
2. Proxy testen: `http://<HUB_IP>:4000/api/nodes/1/cover/cover_1.jpg`

---

## 15. Deinstallation

### Service entfernen

```bash
sudo systemctl stop cac-hub
sudo systemctl disable cac-hub
sudo rm /etc/systemd/system/cac-hub.service
sudo systemctl daemon-reload
```

### Dateien loeschen

```bash
sudo rm -rf /opt/cac-controller-hub
```

### Node.js entfernen (nur wenn kein Node auf dem Pi laeuft)

```bash
sudo apt purge -y nodejs
```

---

*CAC Hub v1.0.0 — Copyright (c) 2025 Dirk Jensen*
*MIT License*
