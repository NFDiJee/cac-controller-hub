# Installation auf dem Raspberry Pi

Diese Anleitung beschreibt die Installation des CAC Hub auf einem Raspberry Pi.

Der Hub kann auf demselben Raspberry Pi wie ein Node laufen, oder auf einem separaten Geraet. Er benoetigt keinen seriellen Anschluss — nur eine Netzwerkverbindung zu den Nodes.

## Voraussetzungen

- Raspberry Pi (empfohlen: Pi 3/4/5 oder Zero 2 W) mit Raspberry Pi OS
- SSH-Zugang zum Raspberry Pi
- WLAN oder Ethernet-Verbindung
- Mindestens ein konfigurierter [CAC Controller Node](https://github.com/NFDiJee/cac-controller) mit API-Key

## Hinweis zur Node-Hardware

Jeder CAC Controller Node verbindet sich per serieller Schnittstelle mit dem Pioneer-Wechsler. Fuer den Hub ist das nicht relevant (nur Netzwerk), aber fuer die Nodes gilt:

- **DIP-Schalter**: Beim CAC-V3000 muss DIP-Schalter 3 = ON stehen (9600 Baud).
- **Interne RPi-Integration**: Alternativ kann ein Raspberry Pi Zero W direkt im CAC-Gehaeuse montiert werden (HLK-PM01 Netzteil, TTL-Seriell am RSIF-Board-Eingang, Spannungsteiler fuer 5V→3.3V, Relais fuer Stromsteuerung, USB-WiFi mit externer Antenne). Details in der [CAC Controller Installationsanleitung](https://github.com/NFDiJee/cac-controller).

---

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
