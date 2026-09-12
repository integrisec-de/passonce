# PassOnce — self-hosted, zero-knowledge one-time secret sharing

Passwörter und Geheimnisse über einen **Einmal-Link** teilen, der sich nach dem
Abruf selbst zerstört. Die Verschlüsselung passiert **im Browser** (AES-256-GCM);
der Schlüssel steht nur im URL-Fragment (`#…`) und erreicht den Server nie — der
Server speichert ausschließlich Ciphertext (**Zero-Knowledge**).

Self-hosted-Variante des integrisec-Tools, als echtes Zero-Knowledge gebaut.
Läuft als **ein Docker-Container** (oder direkt mit Node) — **keine
npm-Abhängigkeiten**, dank Nodes eingebautem SQLite.

> **White-label:** Wortmarke im `<header>` der HTML-Dateien und Farben in
> `public/style.css` (`:root`) anpassen.

---

## Funktionen

- **Zero-Knowledge** — Ver-/Entschlüsselung (AES-256-GCM) im Browser; der Schlüssel steht nur im URL-Fragment, der Server speichert ausschließlich Ciphertext.
- **Burn-after-read** — der Einmal-Link wird beim Abruf **atomar** gelöscht; ein zweiter Aufruf läuft ins Leere.
- **Optionales Passwort** — zusätzlicher Schutz (PBKDF2 + Verifier); ein falsches Passwort verbrennt das Geheimnis **nicht**.
- **Ablaufzeit** — 1 Stunde bis 7 Tage (konfigurierbar); nicht abgerufene Geheimnisse löschen sich selbst.
- **Scanner-sicher** — id + Schlüssel im Fragment, Anzeige erst per Klick → Link-Prefetch durch Mail-/Chat-Scanner verbrennt nichts.
- **Optionale Server-Encrypt-API** — fertige Einmal-Links per Token-Aufruf (`{url}`) fürs eigene, vertrauenswürdige Netz (in diesem Modus kein Zero-Knowledge).
- **Ein Container** — `docker compose up`, keine externe Datenbank, **keine npm-Abhängigkeiten**.
- **Automatisches HTTPS** — via Caddy (Let's Encrypt) oder lokale CA (`tls internal`) für abgeschottete Netze.
- **White-label** — Wortmarke und Farben in Minuten anpassbar.
- **Schlank & auditierbar** — ein `server.js`, statisches Frontend, kein Build-Schritt.

## Voraussetzungen

- **Docker-Variante (empfohlen):** Docker Engine + Compose v2; offene Ports **80** und **443**; eine **Domain** mit A/AAAA-Record auf den Host (für automatisches HTTPS).
- **Ohne Docker:** Node.js **≥ 22.13** und ein eigener TLS-Reverse-Proxy.
- **Internes/abgeschottetes Netz:** kein öffentliches DNS nötig — Caddy stellt mit `tls internal` eine eigene lokale CA bereit.

Das Installieren dieser Pakete erfordert **Root-Rechte** (`sudo`).

> **Achtung bei den Paketquellen:** Ältere LTS-Stände liefern über `apt` nur
> Node 18 oder 20 — damit startet PassOnce nicht, weil das eingebaute
> `node:sqlite` fehlt. Prüfen mit `apt-cache policy nodejs`. Ist der Kandidat
> zu alt, Node über [nodejs.org](https://nodejs.org/en/download) oder einen
> Versionsmanager wie `nvm` beziehen. Ubuntu 26.04 liefert Node 22 direkt mit,
> ebenso `docker.io` und `docker-compose-v2`.

---

## Schnellstart

### Schritt 1 — Dateien holen

```bash
git clone https://github.com/integrisec-de/passonce.git
cd passonce
```

Ohne Git? Dann das Archiv laden und entpacken:

```bash
curl -fsSL -o passonce.tar.gz https://github.com/integrisec-de/passonce/archive/refs/heads/main.tar.gz
tar -xzf passonce.tar.gz
cd passonce-main
```

Fertige Release-Archive liegen unter
<https://github.com/integrisec-de/passonce/releases>.

### Schritt 2 — Einrichten und starten

Alle folgenden Befehle laufen in diesem Verzeichnis.

**Am einfachsten — `setup.sh`** (fragt nach Domain, erzeugt `.env` inkl. optional
sicher generiertem API-Token und startet alles):

```bash
./setup.sh                            # interaktiv
./setup.sh --domain secret.example.com   # nicht-interaktiv
./setup.sh --help                     # alle Optionen
```

**Oder manuell (Docker + Caddy, automatisches HTTPS):**

```bash
cp .env.example .env
# in .env: SITE_ADDRESS=secret.example.com   (zeigt per DNS auf diesen Host)
docker compose up -d
```

Caddy holt für die Domain automatisch ein Let's-Encrypt-Zertifikat. Fertig:
`https://secret.example.com`

**Internes Netz ohne öffentliches DNS?** In der `Caddyfile` den Block auf
`:443 { tls internal … }` umstellen (Caddy nutzt dann eine eigene lokale CA) oder
ein eigenes Zertifikat hinterlegen. Beispiele stehen auskommentiert in der Datei.

**Nur schnell lokal testen (ohne TLS):** `SITE_ADDRESS=:80` in der `.env`.

## Ohne Docker (VM / systemd)

Voraussetzung: **Node.js ≥ 22.13**.

```bash
set -a; . ./.env; set +a      # Konfiguration laden — nicht weglassen!
node server.js
# läuft auf http://localhost:8080  — gehört hinter einen TLS-Reverse-Proxy!
```

> **Warum die erste Zeile Pflicht ist:** `server.js` liest seine Konfiguration
> ausschließlich aus Umgebungsvariablen und liest die `.env` **nicht** von
> selbst ein. Wer nur `node server.js` startet, betreibt den Dienst mit den
> eingebauten Standardwerten — `MAX_TTL`, `MIN_TTL`, `RATE_LIMIT_PER_MIN`,
> `ALLOW_SERVER_ENCRYPT`, `API_TOKEN` und `BASE_URL` aus der `.env` bleiben
> dann **wirkungslos, ohne jede Warnung**. Genau diesen Startbefehl gibt auch
> `./setup.sh --node` aus.

`server.js` bringt alles mit (Statik + API + SQLite). Für Produktion einen
Reverse-Proxy mit TLS davorstellen (Caddy, nginx, Traefik …).

**Zum `--experimental-sqlite`-Flag:** Ab **Node 22.13** wird es nicht mehr
gebraucht — `node:sqlite` ist seitdem ohne Flag verfügbar (weiterhin als
experimentell markiert). Nur auf Node 22.5 bis 22.12 muss `node
--experimental-sqlite server.js` gestartet werden. Das mitgelieferte
Docker-Image und `npm start` führen das Flag weiterhin mit; ab 22.13 ist es
wirkungslos, aber unschädlich.

**Zur Startmeldung:** Auf Node 22 erscheint beim Start
`ExperimentalWarning: SQLite is an experimental feature`. Das ist erwartbar und
kein Fehler; ab Node 24 entfällt die Meldung.

Beispiel `systemd`-Unit (`/etc/systemd/system/passonce.service`):

```ini
[Unit]
Description=PassOnce
After=network.target

[Service]
WorkingDirectory=/opt/passonce
EnvironmentFile=/opt/passonce/.env
ExecStart=/usr/bin/node server.js
Environment=PORT=8080
Restart=on-failure
User=passonce

[Install]
WantedBy=multi-user.target
```

`./setup.sh --node` bereitet die `.env` dafür vor.

---

## Sicherheit: HTTPS ist Pflicht

Zero-Knowledge schützt nur **mit TLS**. Der Schlüssel steht zwar im URL-Fragment
(geht nie an den Server), aber ohne HTTPS könnte ein Angreifer im Netz die
ausgelieferte Seite manipulieren und per eingeschleustem JavaScript den Schlüssel
abgreifen. Deshalb **immer hinter HTTPS** betreiben (Caddy erledigt das von selbst).

Eine Schwachstelle gefunden? Bitte **kein öffentliches Issue** — der Meldeweg
steht in [`SECURITY.md`](SECURITY.md).

---

## Konfiguration (ENV)

Die Defaults unterscheiden sich teilweise zwischen den beiden Betriebsarten:

| Variable | Default (Docker) | Default (Node direkt) | Bedeutung |
|---|---|---|---|
| `SITE_ADDRESS` | `:80` | *(ohne Wirkung)* | Caddy-Adresse/Domain (TLS automatisch bei echter Domain). Wird nur von Caddy gelesen — im Node-Betrieb ohne Funktion. |
| `PORT` | `8080` | `8080` | Port der App (hinter dem Proxy) |
| `DB_PATH` | `/data/secrets.db` | `data/secrets.db` **relativ zum Verzeichnis von `server.js`** | SQLite-Datei. Im Container ein Volume, im Node-Betrieb ein Unterverzeichnis der Installation — dort liegen die Daten fürs Backup. |
| `MIN_TTL` | `300` | `300` | **kleinste** Lebensdauer in Sekunden (5 Minuten). Kleinere Werte werden stillschweigend angehoben — siehe Hinweis unter [API](#api). |
| `DEFAULT_TTL` | `86400` | `86400` | Lebensdauer, wenn die Anfrage kein `ttl` enthält (1 Tag) |
| `MAX_TTL` | `604800` | `604800` | **größte** Lebensdauer in Sekunden (7 Tage). Größere Werte werden stillschweigend gekappt. |
| `RATE_LIMIT_PER_MIN` | `60` | `60` | Anfragen pro IP/Minute auf `/api/*`; darüber HTTP 429 |
| `ALLOW_SERVER_ENCRYPT` | `false` | `false` | Server-Encrypt-API aktivieren (s. u.) |
| `API_TOKEN` | – | – | Token für die Server-Encrypt-API — siehe Hinweis unten zum Umgang damit |
| `BASE_URL` | – | – | Basis-URL für von der API zurückgegebene Links. **Pflicht, sobald `ALLOW_SERVER_ENCRYPT=true`** — sonst verweigert der Dienst den Start. |

### Zum Umgang mit dem `API_TOKEN`

Das Token ist der einzige Schutz der Server-Encrypt-API. Zwei Stellen, an denen
es sichtbar wird und die man kennen sollte — beides ist kein Defekt, sondern
Betreiberwissen:

* **`setup.sh` gibt das erzeugte Token einmal auf dem Terminal aus.** Das ist
  gewollt, Sie brauchen es ja. Es landet damit aber im **Scrollback** Ihrer
  Sitzung und, falls Sie das Skript unter `tee`, `script` oder in einer
  CI-Pipeline laufen lassen, in deren **Protokolldatei**. Die erzeugte `.env`
  selbst wird mit Dateirechten `600` angelegt.
* **Im Docker-Betrieb steht das Token als Umgebungsvariable im Container.** Es
  ist damit über `docker inspect` und in `/proc/1/environ` lesbar — für jeden,
  der Zugriff auf den Docker-Daemon oder den Container hat. Für Compose ist das
  üblich; enger wird es mit einer `env_file`, die Sie mit `600` selbst verwalten,
  oder mit Docker Secrets.

Wenn Sie den Verdacht haben, dass das Token in ein Protokoll geraten ist:
neu erzeugen (`./setup.sh --server-encrypt --force`) und den Dienst neu starten.

---

## API

### Zero-Knowledge (Standard, vom Web-UI genutzt)
- `POST /api/secrets` — `{ ciphertext, iv, salt?, verifier?, needs_passphrase, ttl }` → `{ id, expires_at, ttl_effective, ttl_adjusted?, ttl_requested? }`
- `GET  /api/secrets/:id/meta` — `{ exists, needs_passphrase, salt }` (kein Burn)
- `POST /api/secrets/:id/reveal` — `{ verifier? }` → `{ ciphertext, iv }` (löscht atomar)

Der Client verschlüsselt/entschlüsselt selbst; der Schlüssel bleibt im Fragment.

> **`ttl` wird in den erlaubten Bereich gezwungen — die Antwort sagt es Ihnen.**
> Der Server begrenzt jeden Wert auf `MIN_TTL … MAX_TTL` (Standard **300 s bis
> 604800 s**). `ttl: 60` ergibt also ein Geheimnis, das **300 Sekunden** lebt,
> nicht 60. Fehlt `ttl` oder ist es keine Zahl, gilt `DEFAULT_TTL` (1 Tag).
>
> Damit das nicht unbemerkt bleibt, weist die Antwort die tatsächliche
> Lebensdauer aus und kennzeichnet eine Korrektur:
>
> ```jsonc
> // ttl: 60 angefragt
> { "id": "…", "expires_at": 1789223567,
>   "ttl_effective": 300, "ttl_adjusted": true, "ttl_requested": 60 }
>
> // ttl: 3600 angefragt — im erlaubten Bereich, keine Korrektur
> { "id": "…", "expires_at": 1789226868, "ttl_effective": 3600 }
> ```
>
> `ttl_effective` steht immer in der Antwort; `ttl_adjusted` und `ttl_requested`
> nur, wenn tatsächlich korrigiert wurde. Das Auffüllen eines fehlenden `ttl`
> mit `DEFAULT_TTL` gilt nicht als Korrektur. Wer kürzere Laufzeiten braucht,
> muss `MIN_TTL` senken; das gilt für beide Endpunkte, auch für Server-Encrypt.

### Server-Encrypt (optional, kein Zero-Knowledge)
Nur wenn `ALLOW_SERVER_ENCRYPT=true` **und** gültiges `API_TOKEN`. Hier verschlüsselt
der **Server** — also **kein** Zero-Knowledge mehr; nur fürs eigene vertrauenswürdige Netz.

```bash
curl -s -X POST https://secret.example.com/api/secrets/plain \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "content-type: application/json" \
  -d '{"secret":"mein geheimnis","ttl":3600}'
# -> {"url":"https://secret.example.com/s/#<id>.<key>","expires_at":...,"ttl_effective":3600}
```

Der zurückgegebene Link funktioniert mit derselben Anzeige-Seite und wird beim
Öffnen einmalig entschlüsselt und gelöscht.

> ### ⚠ In diesem Modus steht der Schlüssel im Antwort-Body
>
> Im Zero-Knowledge-Betrieb erreicht der Schlüssel den Server nie — er entsteht
> im Browser und bleibt im URL-Fragment. **Hier ist das anders:** Der Server
> erzeugt den Schlüssel selbst und gibt ihn als Teil der URL zurück
> (`…/s/#<id>.<key>`). Diese URL steht damit im **HTTP-Antwort-Body**.
>
> Das ist die Stelle, an der ein Betreiber sein Zero-Knowledge verliert, ohne es
> zu merken — nicht durch einen Angriff, sondern durch gewöhnliche
> Betriebspraxis:
>
> * **Body-Logging am Reverse-Proxy.** Viele Setups protokollieren
>   Antwort-Bodies zur Fehlersuche. Wer das aktiviert, schreibt den Schlüssel
>   jedes erzeugten Geheimnisses ins Log.
> * **APM- und Tracing-Agenten** erfassen Antwortinhalte oft standardmäßig.
> * **Terminal-Scrollback und CI-Logs.** Das `curl`-Beispiel oben schreibt den
>   Link auf die Standardausgabe. In einer Pipeline landet er in deren Protokoll.
> * **Fehlerbehandlung im aufrufenden Programm.** Eine Zeile
>   `log.error("Antwort: " + body)` genügt.
>
> Wer diesen Modus nutzt, sollte Body-Logging für `/api/secrets/plain`
> ausdrücklich ausschließen und die Aufrufe nicht in Protokolle schreiben.
> Im Zweifel: Der Zero-Knowledge-Weg über die Weboberfläche hat dieses Problem
> nicht.
>
> **`BASE_URL` ist in diesem Modus Pflicht.** Ohne den Wert würde die Herkunft
> des zurückgegebenen Links aus dem Host-Header der Anfrage stammen, also vom
> Aufrufer bestimmt. Der Dienst **verweigert deshalb den Start**, wenn
> `ALLOW_SERVER_ENCRYPT=true` gesetzt ist und `BASE_URL` fehlt — sichtbares
> Scheitern statt stillschweigend falscher Links. `./setup.sh --server-encrypt`
> trägt den Wert automatisch ein.

---

## Installation prüfen

Nach dem Start ein schneller Health-Check (kein Geheimnis nötig):

```bash
curl -fsS https://secret.example.com/api/secrets/zzzzzzzzzzzz/meta
# -> {"exists":false}     (Function + Datenbank erreichbar)
```

Dann im Browser die Seite öffnen, ein Test-Geheimnis anlegen, den Link in einem
zweiten Browser/Inkognito-Fenster öffnen und prüfen, dass er nach dem ersten
Abruf erlischt.

## Update

**Mit Git geklont:**

```bash
cd /pfad/zu/passonce
git pull
docker compose up -d --build      # Node-Setup: Dienst neu starten
```

**Über ein Archiv installiert** (kein Git-Repo vorhanden — `git pull` schlägt
hier fehl): neues Archiv daneben entpacken und nur den Programmstand ersetzen.

```bash
cd /pfad/zu
curl -fsSL -o passonce-neu.tar.gz https://github.com/integrisec-de/passonce/archive/refs/heads/main.tar.gz
tar -xzf passonce-neu.tar.gz                  # entpackt nach passonce-main/

cp -r passonce-main/. passonce/               # Programmdateien ueberschreiben
cd passonce
docker compose up -d --build                  # Node-Setup: Dienst neu starten
```

> **Diese beiden dürfen beim Update nicht überschrieben werden:**
>
> | Pfad | Inhalt |
> |---|---|
> | `.env` | Ihre Konfiguration inklusive `API_TOKEN` — liegt nicht im Archiv und wird von `cp` daher nicht angefasst |
> | `data/` | die SQLite-Datenbank im **Node-Betrieb**; im Docker-Betrieb liegen die Daten stattdessen im Volume `secrets-data` |
>
> Beides ist auch in der `.gitignore` ausgenommen. Legen Sie vor dem Update
> trotzdem eine Kopie an — im Node-Betrieb genügt `cp -a data data.bak`, im
> Docker-Betrieb bleibt das Volume ohnehin unberührt.

Die Daten bleiben erhalten — sie liegen im Volume `secrets-data` bzw. unter
`data/`, nicht im Image und nicht im Archiv.

## Deinstallation

```bash
docker compose down -v   # entfernt Container UND Volumes (inkl. aller Geheimnisse)
```

## Troubleshooting

- **Kein Zertifikat / HTTPS schlägt fehl:** DNS muss auf den Host zeigen und die Ports **80 + 443** müssen erreichbar sein (Let's-Encrypt-Challenge). Logs: `docker compose logs caddy`.
- **Internes Netz ohne öffentliches DNS:** in der `Caddyfile` auf `:443 { tls internal … }` umstellen.
- **`./setup.sh: bad interpreter`:** Datei wurde mit CRLF gespeichert — `sed -i 's/\r$//' setup.sh`. (Das Repo liefert LF; betrifft nur manuelle Bearbeitung unter Windows.)
- **Server-Encrypt antwortet `404`:** `ALLOW_SERVER_ENCRYPT=true` **und** `API_TOKEN` gesetzt? Danach Dienst neu starten.
- **Seite bleibt stumm, obwohl `docker compose up -d` „Started" meldet:** Tritt auf, wenn der **erste** Start fehlschlug, weil Port 80 oder 443 schon belegt war (anderer Webserver, anderer Container). Der Container existiert dann zwar, veröffentlicht aber keine Ports — und ein erneutes `docker compose up -d` startet ihn bloß, ohne das zu heilen. Erkennen:

  ```bash
  docker inspect -f '{{json .NetworkSettings.Ports}}' passonce-caddy-1
  # -> {}  bedeutet: keine Ports veroeffentlicht
  ```

  Beheben (nachdem der Port frei ist — `ss -tlnp | grep -E ':(80|443) '` zeigt den Belegier):

  ```bash
  docker compose up -d --force-recreate caddy
  ```
- **App-Logs:** `docker compose logs -f app`.

---

## Wie es funktioniert

1. **Erstellen:** Browser erzeugt Zufallsschlüssel **K** + verschlüsselt den Text
   (AES-256-GCM). Optional: zusätzliches Passwort (PBKDF2 + Verifier — ein falsches
   Passwort beim Abruf verbrennt das Geheimnis **nicht**). Server speichert nur
   Ciphertext unter `SHA-256(id)`. Link: `…/s/#<id>.<K>`.
2. **Abrufen:** Anzeige-Seite liest `id` + `K` aus dem Fragment, holt die Metadaten
   (kein Burn), und erst per Klick den Ciphertext — der dabei **atomar gelöscht**
   wird (`DELETE … RETURNING`). Entschlüsselung im Browser.
3. **Ablauf:** Jedes Geheimnis hat ein TTL; der Server prunt abgelaufene Einträge
   periodisch. Abgelaufenes wird nie ausgeliefert.

## Stack

- **Node.js ≥ 22**, ein `server.js`, **keine npm-Abhängigkeiten** (`node:sqlite`)
- **SQLite** als eine Datei (Volume)
- **Caddy** als Reverse-Proxy mit automatischem HTTPS
- Frontend: statisches HTML/CSS + Web Crypto, kein Build-Schritt

## Lizenz

Apache License 2.0 — siehe [`LICENSE`](LICENSE). Das [`NOTICE`](NOTICE) nennt
Copyright, Markenvorbehalt und den Umfang der Veröffentlichung.

Diese Veröffentlichung ist ein Auszug des Entwicklungs-Repositorys: Sie umfasst
die Software, die ein Betreiber installiert — Server, Schema, die
clientseitige Zero-Knowledge-Krypto und die Oberfläche. Nicht enthalten sind die
Inhalte des gehosteten Dienstes passonce.de und dessen Cloudflare-spezifische
Betriebsvariante.

Die Software enthält keinen Fremdcode und liefert keine Assets Dritter mit.

PassOnce ist kostenfrei nutzbar. Bei Einführung und Integration in die eigene
Umgebung unterstützt [integrisec](https://integrisec.de) als Beratungsleistung.
