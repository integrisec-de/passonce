#!/usr/bin/env bash
#
# PassOnce — Setup. Erzeugt .env (optional mit sicherem API-Token) und startet den Dienst.
#
#   ./setup.sh                            interaktiv, mit Docker + Caddy (automatisches HTTPS)
#   ./setup.sh --domain secret.example.com   Domain vorgeben
#   ./setup.sh --domain :80               ohne TLS (nur Test / internes Netz hinter eigenem Proxy)
#   ./setup.sh --server-encrypt           Server-Encrypt-API aktivieren (Token wird erzeugt)
#   ./setup.sh --node                     ohne Docker — nur Konfiguration + Node-Startbefehl
#   ./setup.sh -y                         keine Rückfragen (Defaults/Flags verwenden)
#
set -euo pipefail
cd "$(dirname "$0")"

# ── Optik ───────────────────────────────────────────────────────────────────
if [ -t 1 ]; then B='\033[1m'; G='\033[32m'; Y='\033[33m'; R='\033[31m'; C='\033[36m'; N='\033[0m'
else B=''; G=''; Y=''; R=''; C=''; N=''; fi
info() { printf "${C}›${N} %s\n" "$*"; }
ok()   { printf "${G}✓${N} %s\n" "$*"; }
warn() { printf "${Y}!${N} %s\n" "$*"; }
die()  { printf "${R}✗ %s${N}\n" "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
PassOnce — Setup
  ./setup.sh [Optionen]
    --domain <d>       Domain für automatisches HTTPS (oder ":80" zum Testen)
    --server-encrypt   Server-Encrypt-API aktivieren (Server verschluesselt; Token wird erzeugt)
    --node             ohne Docker: nur .env vorbereiten + Node-Startbefehl ausgeben
    --port <p>         App-/Node-Port (Default 8080)
    --force            bestehende .env überschreiben
    -y, --yes          keine Rückfragen (Defaults bzw. Flags verwenden)
    -h, --help         diese Hilfe
EOF
}

# ── Flags ───────────────────────────────────────────────────────────────────
DOMAIN=""; SERVER_ENCRYPT="false"; MODE="docker"; ASSUME_YES="false"; FORCE="false"; PORT="8080"; MAX_TTL="604800"; RATE_LIMIT="60"
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2;;
    --domain=*) DOMAIN="${1#*=}"; shift;;
    --server-encrypt) SERVER_ENCRYPT="true"; shift;;
    --node) MODE="node"; shift;;
    --port) PORT="${2:-}"; shift 2;;
    --port=*) PORT="${1#*=}"; shift;;
    --force) FORCE="true"; shift;;
    -y|--yes) ASSUME_YES="true"; shift;;
    -h|--help) usage; exit 0;;
    *) die "Unbekannte Option: $1 (siehe --help)";;
  esac
done

ask() {  # ask "Frage" "default"  -> Antwort auf stdout
  local q="$1" def="${2:-}" a
  if [ "$ASSUME_YES" = "true" ]; then printf '%s' "$def"; return; fi
  if [ -n "$def" ]; then printf "%s [%s]: " "$q" "$def" >&2; else printf "%s: " "$q" >&2; fi
  read -r a </dev/tty || true
  printf '%s' "${a:-$def}"
}
yesno() {  # yesno "Frage" "Y|N"
  local q="$1" def="${2:-N}" a
  if [ "$ASSUME_YES" = "true" ]; then [ "$def" = "Y" ]; return; fi
  printf "%s [%s]: " "$q" "$([ "$def" = Y ] && echo 'Y/n' || echo 'y/N')" >&2
  read -r a </dev/tty || true; a="${a:-$def}"
  case "$a" in y|Y|yes|Yes|j|J|ja) return 0;; *) return 1;; esac
}
gen_token() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 32
  elif [ -r /dev/urandom ]; then head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  else die "Kann kein sicheres Token erzeugen (weder openssl noch /dev/urandom verfügbar)."; fi
}

echo; printf "${B}PassOnce — Setup${N}\n\n"

# ── .env erzeugen ───────────────────────────────────────────────────────────
if [ -f .env ] && [ "$FORCE" != "true" ]; then
  warn ".env existiert bereits — wird beibehalten (--force zum Neuschreiben)."
else
  [ -z "$DOMAIN" ] && DOMAIN="$(ask 'Domain für automatisches HTTPS (oder :80 zum Testen)' 'secret.example.com')"
  if [ "$SERVER_ENCRYPT" != "true" ] && yesno 'Server-Encrypt-API (Server verschluesselt, kein Zero-Knowledge) aktivieren?' 'N'; then
    SERVER_ENCRYPT="true"
  fi
  API_TOKEN=""; BASE_URL=""
  if [ "$SERVER_ENCRYPT" = "true" ]; then
    API_TOKEN="$(gen_token)"
    case "$DOMAIN" in :*|"") BASE_URL="";; *) BASE_URL="https://$DOMAIN";; esac
  fi
  umask 077
  cat > .env <<EOF
# Von setup.sh erzeugt. Enthält Geheimnisse -> nicht committen.
# SITE_ADDRESS liest ausschliesslich Caddy (Docker-Betrieb).
# Im Node-Betrieb ohne Wirkung - dort bestimmt der Reverse-Proxy die Adresse.
SITE_ADDRESS=$DOMAIN
MAX_TTL=$MAX_TTL
RATE_LIMIT_PER_MIN=$RATE_LIMIT
ALLOW_SERVER_ENCRYPT=$SERVER_ENCRYPT
API_TOKEN=$API_TOKEN
BASE_URL=$BASE_URL
EOF
  ok ".env geschrieben (Dateirechte 600)."
  if [ "$SERVER_ENCRYPT" = "true" ]; then
    printf "  ${B}API-Token:${N} %s\n" "$API_TOKEN"
    info "Token sicher aufbewahren (steht auch in .env). Aufruf: Authorization: Bearer <token>"
  fi
fi

# Werte für die Zusammenfassung laden
set -a; . ./.env; set +a

# ── Starten ─────────────────────────────────────────────────────────────────
if [ "$MODE" = "docker" ]; then
  if docker compose version >/dev/null 2>&1; then DC="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose"
  else die "Docker Compose nicht gefunden. Docker installieren oder mit --node fortfahren."; fi

  info "Baue & starte: $DC up -d --build"
  $DC up -d --build
  echo; ok "PassOnce läuft."
  case "${SITE_ADDRESS:-}" in
    :80|"")  info "Erreichbar unter ${B}http://<dieser-host>${N}  ${Y}(ohne TLS — nur Test!)${N}";;
    :*)      info "Erreichbar auf Port ${SITE_ADDRESS}";;
    *)       info "Erreichbar unter ${B}https://${SITE_ADDRESS}${N}  (Caddy holt das Zertifikat automatisch)";;
  esac
  info "Logs:  $DC logs -f       Stop:  $DC down"
else
  command -v node >/dev/null 2>&1 || die "Node.js nicht gefunden (>=22 nötig)."
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$NODE_MAJOR" -ge 22 ] || die "Node $NODE_MAJOR gefunden, aber >=22 nötig."
  echo; ok "Konfiguration bereit (.env)."
  warn "Node-Modus liefert reines HTTP auf :${PORT} — unbedingt hinter einen TLS-Reverse-Proxy stellen!"
  echo; info "Starten:"
  echo "    set -a; . ./.env; set +a"
  echo "    PORT=${PORT} node server.js"
  echo; info "Dauerbetrieb: als systemd-Service einrichten (Beispiel in der README)."
fi

echo; ok "Fertig."
