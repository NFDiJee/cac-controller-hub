# Installation auf dem Raspberry Pi

Diese Anleitung beschreibt die Installation des CAC Hub auf einem Raspberry Pi.

Der Hub kann auf demselben Raspberry Pi wie ein Node laufen, oder auf einem separaten Geraet. Er benoetigt keinen seriellen Anschluss — nur eine Netzwerkverbindung zu den Nodes.

## Voraussetzungen

- Raspberry Pi (empfohlen: Pi 3/4/5 oder Zero 2 W) mit Raspberry Pi OS
- SSH-Zugang zum Raspberry Pi
- WLAN oder Ethernet-Verbindung
- Mindestens ein konfigurierter [CAC Controller Node](https://github.com/NFDiJee/cac-controller) mit API-Key

### Node-Hardware-Hinweis

Jeder Node (CAC Controller Instanz) wird mit einem Pioneer CAC Wechsler verbunden. Es gibt zwei Anschlussoptionen:

**Option A: Externer USB-RS232-Adapter** (einfach)
- USB-zu-Seriell-Adapter (FTDI, PL2303 oder CH340) + RS-232C-Kabel mit 15-poligem D-Sub-Stecker
- Port: `/dev/ttyUSB0`

**Option B: Interner RPi Zero W Einbau** (fortgeschritten)
- Raspberry Pi Zero W im CAC-V3000-Gehaeuse eingebaut
- TTL-Seriell-Signale am **RSIF-Board-Eingang** abgegriffen (Uebergabe vom MCDR-Board) -- beide Boards unter der rechten Seitenabdeckung (von vorne gesehen)
- Spannungsteiler (1kOhm / 2kOhm) fuer 5V-nach-3,3V-Pegelanpassung auf der RX-Leitung
- Stromversorgung: Hi-Link HLK-PM01 (230V AC nach 5V DC) vom Netzeingang vor dem Netzschalter
- Relais (JQC-3FF-S-Z, Active HIGH) an GPIO17 fuer Stromsteuerung
- Netzwerk: Mini-USB-auf-USB-A-Adapter + TP-Link TL-WN722N WLAN-Stick mit SMA-Anschluss fuer externe Antenne, oder USB-Ethernet-Adapter
- Port: `/dev/ttyAMA0`

**DIP-Schalter**: Am CAC-V3000 muss DIP-Schalter 3 auf ON stehen fuer 9600 Baud (hinter der Fronttuere).

Siehe die [CAC Controller Dokumentation](https://github.com/NFDiJee/cac-controller) fuer detaillierte Hardware-Anleitungen.

## Schritt 1: Node.js installieren

Falls noch nicht vorhanden:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential python3
```

## Schritt 2: Hub installieren

```bash
cd /opt
sudo git clone https://github.com/NFDiJee/cac-controller-hub.git
sudo chown -R pi:pi /opt/cac-controller-hub
cd /opt/cac-controller-hub
npm install
```

## Schritt 3: Erster Test

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

Im Browser oeffnen: `http://<PI_IP>:4000`

## Schritt 4: Nodes hinzufuegen

1. Im Hub-Browser unter **Einstellungen** einen Node hinzufuegen
2. **URL**: `http://<NODE_IP>:3000`
3. **API-Key**: Der im Node konfigurierte API-Key
4. **Verbindung testen** — Name, Raum und Modell werden automatisch uebernommen
5. **Hinzufuegen** klicken
6. Optional: Node bearbeiten (Stift-Symbol) und **GPIO-Pin** fuer Relais-Steuerung eintragen (z.B. `17`)

## Schritt 5: Systemd-Service einrichten

```bash
sudo cp /opt/cac-controller-hub/cac-hub.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable cac-hub
sudo systemctl start cac-hub
```

Status pruefen:
```bash
sudo systemctl status cac-hub
```

## Schritt 6: Autostart pruefen

```bash
sudo reboot
```

Nach dem Neustart: `http://<PI_IP>:4000`

---

## Hub und Node auf demselben Pi

Falls Hub und Node auf demselben Raspberry Pi laufen:

- Node laeuft auf Port **3000** (Standard)
- Hub laeuft auf Port **4000** (Standard)
- Beide koennen gleichzeitig als systemd-Services laufen
- Node im Hub hinzufuegen mit URL `http://localhost:3000`

---

## Fehlerbehebung

### Hub startet nicht
```bash
sudo journalctl -u cac-hub --no-pager -n 50
```

### Node nicht erreichbar
```bash
# Vom Hub-Pi aus testen:
curl -H "X-API-Key: DEIN_KEY" http://<NODE_IP>:3000/api/node/info
```

### Port 4000 belegt
In den Hub-Einstellungen einen anderen Port waehlen, dann:
```bash
sudo systemctl restart cac-hub
```

---

## Updates

```bash
cd /opt/cac-controller-hub
git pull
npm install
sudo systemctl restart cac-hub
```

## Deinstallation

```bash
sudo systemctl stop cac-hub
sudo systemctl disable cac-hub
sudo rm /etc/systemd/system/cac-hub.service
sudo systemctl daemon-reload
sudo rm -rf /opt/cac-controller-hub
```
