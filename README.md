# Auto-Kostenteilung

Web-App zur Erfassung und Aufteilung von Fahrzeugkosten auf zwei Familien.

## Features

- Fahrten erfassen (km manuell oder automatisch über Start/Ziel)
- Kosten erfassen (Tanken, Wartung, Versicherung, Steuer, Reparatur, Sonstiges)
- Kostenaufteilung nach gefahrenen Kilometern
- Monats- und Jahresauswertungen
- Automatische Km-Berechnung via OpenRouteService API

## Deployment (Proxmox LXC oder VM mit Docker)

### Voraussetzungen

```bash
apt install -y docker.io docker-compose-plugin
```

### Starten

```bash
git clone <repo> car-cost-tracker   # oder Ordner übertragen
cd car-cost-tracker
docker compose up -d
```

Die App läuft dann auf **http://<server-ip>:8080**

### Daten

Die SQLite-Datenbank liegt in `./data/car_costs.db` und bleibt bei Updates erhalten.

## Automatische Km-Berechnung (optional)

1. Kostenlos registrieren auf https://openrouteservice.org
2. API-Key kopieren
3. In der App unter **Einstellungen → OpenRouteService API-Key** eintragen

Ohne API-Key können Kilometer weiterhin manuell eingetragen werden.

## Update

```bash
docker compose pull
docker compose up -d --build
```
