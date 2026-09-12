'use strict';
/*
 * Secret — self-hosted, zero-knowledge one-time secret sharing.
 * Single-file Node-Server, kein node_modules (nutzt das eingebaute node:sqlite).
 * Start:  node --experimental-sqlite server.js
 *
 * Endpoints:
 *   POST /api/secrets               Ciphertext ablegen (zero-knowledge)       -> { id, expires_at }
 *   GET  /api/secrets/:id/meta      Metadaten, OHNE Burn                       -> { exists, needs_passphrase, salt }
 *   POST /api/secrets/:id/reveal    Ciphertext einmalig ausliefern + loeschen -> { ciphertext, iv }
 *   POST /api/secrets/plain         Server-Encrypt (Server verschluesselt)*    -> { url, expires_at }
 *   (*) nur wenn ALLOW_SERVER_ENCRYPT=true und gueltiges API_TOKEN
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// ── Konfiguration (per ENV) ────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '8080', 10);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'secrets.db');
const MAX_CIPHERTEXT_B64 = parseInt(process.env.MAX_CIPHERTEXT_B64 || String(96 * 1024), 10);
const MAX_TTL = parseInt(process.env.MAX_TTL || String(7 * 24 * 3600), 10);
const MIN_TTL = parseInt(process.env.MIN_TTL || String(5 * 60), 10);
const DEFAULT_TTL = parseInt(process.env.DEFAULT_TTL || String(24 * 3600), 10);

// Angefragte Lebensdauer in den erlaubten Bereich bringen. Die Korrektur wird
// in der Antwort ausgewiesen (ttl_adjusted/ttl_effective), damit ein Aufrufer
// nicht faelschlich annimmt, sein Wunschwert sei uebernommen worden.
function resolveTtl(raw) {
  let requested = Math.floor(Number(raw));
  const missing = !Number.isFinite(requested);
  if (missing) requested = DEFAULT_TTL;
  const effective = Math.max(MIN_TTL, Math.min(MAX_TTL, requested));
  return { effective, adjusted: !missing && effective !== requested, requested };
}
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT_PER_MIN || '60', 10);
const ALLOW_SERVER_ENCRYPT = /^(1|true|yes)$/i.test(process.env.ALLOW_SERVER_ENCRYPT || '');
const API_TOKEN = process.env.API_TOKEN || '';
const BASE_URL = (process.env.BASE_URL || '').replace(/\/+$/, '');

// Server-Encrypt ohne BASE_URL waere still gefaehrlich: Die zurueckgegebene
// URL wuerde dann aus dem Host-Header des Aufrufers gebaut. Lieber sichtbar
// scheitern als Links ausliefern, deren Herkunft jemand anderes bestimmt.
if (ALLOW_SERVER_ENCRYPT && !BASE_URL) {
  console.error('FEHLER: ALLOW_SERVER_ENCRYPT=true, aber BASE_URL ist nicht gesetzt.');
  console.error('        Die Server-Encrypt-API gibt fertige Links zurueck. Ohne BASE_URL');
  console.error('        stammt deren Herkunft aus dem Host-Header der Anfrage, wird also');
  console.error('        vom Aufrufer bestimmt.');
  console.error('        Setzen Sie BASE_URL, z. B. BASE_URL=https://secret.example.com');
  console.error('        (./setup.sh --server-encrypt traegt den Wert automatisch ein).');
  process.exit(1);
}

// ── Datenbank ──────────────────────────────────────────────────────────────
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const qInsert = db.prepare(
  `INSERT INTO secrets (id_hash, ciphertext, iv, salt, verifier, needs_passphrase, expires_at, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const qMeta = db.prepare('SELECT needs_passphrase, salt FROM secrets WHERE id_hash = ? AND expires_at > ?');
const qBurn = db.prepare(
  `DELETE FROM secrets WHERE id_hash = ? AND expires_at > ? AND (needs_passphrase = 0 OR verifier = ?)
   RETURNING ciphertext, iv`
);
const qExists = db.prepare('SELECT 1 AS ok FROM secrets WHERE id_hash = ? AND expires_at > ?');
const qPrune = db.prepare('DELETE FROM secrets WHERE expires_at < ?');

// periodisches Aufraeumen (alle 10 Min)
setInterval(() => { try { qPrune.run(nowSec()); } catch (_) {} }, 10 * 60 * 1000).unref();

// ── Helfer ─────────────────────────────────────────────────────────────────
const nowSec = () => Math.floor(Date.now() / 1000);
const sha256Hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const isB64 = (s, maxLen) => typeof s === 'string' && s.length > 0 && s.length <= maxLen && B64_RE.test(s);
const genId = () => crypto.randomBytes(16).toString('base64url');

function send(res, status, obj) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  });
  res.end(JSON.stringify(obj));
}

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let data = '', len = 0;
    req.on('data', (c) => {
      len += c.length;
      if (len > limit) { reject(new Error('too-large')); req.destroy(); }
      else data += c;
    });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (_) { reject(new Error('bad-json')); } });
    req.on('error', reject);
  });
}

const clientIp = (req) =>
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

// einfacher Per-IP-Zaehler pro Minute
const hits = new Map();
function rateOk(ip) {
  const win = Math.floor(Date.now() / 60000);
  const key = ip + ':' + win;
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (hits.size > 5000) for (const k of hits.keys()) if (!k.endsWith(':' + win)) hits.delete(k);
  return n <= RATE_LIMIT;
}

// ── API-Handler ────────────────────────────────────────────────────────────
function createSecret(res, body) {
  const { ciphertext, iv, salt, verifier, needs_passphrase, ttl } = body || {};
  if (!isB64(ciphertext, MAX_CIPHERTEXT_B64)) {
    return ciphertext && ciphertext.length > MAX_CIPHERTEXT_B64
      ? send(res, 413, { error: 'too-large' })
      : send(res, 400, { error: 'invalid-payload' });
  }
  if (!isB64(iv, 64)) return send(res, 400, { error: 'invalid-iv' });
  const needsPass = needs_passphrase ? 1 : 0;
  if (needsPass && (!isB64(salt, 64) || typeof verifier !== 'string' || verifier.length !== 64)) {
    return send(res, 400, { error: 'invalid-passphrase-fields' });
  }
  const t = resolveTtl(ttl);
  const ttlSec = t.effective;
  const now = nowSec();
  const id = genId();
  qInsert.run(sha256Hex(id), ciphertext, iv, needsPass ? salt : null, needsPass ? verifier : null, needsPass, now + ttlSec, now);
  return send(res, 200, {
    id,
    expires_at: now + ttlSec,
    ttl_effective: ttlSec,
    ...(t.adjusted ? { ttl_adjusted: true, ttl_requested: t.requested } : {}),
  });
}

function metaSecret(res, id) {
  const row = qMeta.get(sha256Hex(id), nowSec());
  if (!row) return send(res, 200, { exists: false });
  return send(res, 200, { exists: true, needs_passphrase: !!row.needs_passphrase, salt: row.salt || null });
}

function revealSecret(res, id, body) {
  const verifier = body && typeof body.verifier === 'string' ? body.verifier : null;
  const now = nowSec();
  const idHash = sha256Hex(id);
  const row = qBurn.get(idHash, now, verifier);
  if (row) return send(res, 200, { ciphertext: row.ciphertext, iv: row.iv });
  const still = qExists.get(idHash, now);
  return still ? send(res, 403, { error: 'wrong-passphrase' }) : send(res, 404, { error: 'not-found' });
}

// Server-Encrypt: Server verschluesselt selbst, gibt fertigen Einmal-Link zurueck.
function createPlain(req, res, body) {
  if (!ALLOW_SERVER_ENCRYPT) return send(res, 404, { error: 'not-found' });
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (body && body.token) || '';
  if (!API_TOKEN || token !== API_TOKEN) return send(res, 401, { error: 'unauthorized' });

  const secret = body && (body.secret != null ? body.secret : body.text);
  if (typeof secret !== 'string' || !secret) return send(res, 400, { error: 'missing-secret' });
  if (Buffer.byteLength(secret, 'utf8') > 64 * 1024) return send(res, 413, { error: 'too-large' });

  const t = resolveTtl(body.ttl);
  const ttlSec = t.effective;

  // AES-256-GCM serverseitig — gleiches Format wie WebCrypto (ciphertext || 16-Byte-Tag)
  const K = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', K, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(secret, 'utf8')), cipher.final()]);
  const packed = Buffer.concat([ct, cipher.getAuthTag()]).toString('base64');

  const now = nowSec();
  const id = genId();
  qInsert.run(sha256Hex(id), packed, iv.toString('base64'), null, null, 0, now + ttlSec, now);

  const base = BASE_URL || `http://${req.headers.host}`;
  return send(res, 200, {
    url: `${base}/s/#${id}.${K.toString('base64url')}`,
    expires_at: now + ttlSec,
    ttl_effective: ttlSec,
    ...(t.adjusted ? { ttl_adjusted: true, ttl_requested: t.requested } : {}),
  });
}

// ── Statische Auslieferung ─────────────────────────────────────────────────
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
  + "img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; "
  + "base-uri 'self'; form-action 'self'; object-src 'none'";
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy': CSP,
};

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith('/')) rel += 'index.html';
  const filePath = path.join(PUBLIC, path.normalize(rel));
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream', ...SECURITY_HEADERS });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}

// ── Router ─────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://localhost').pathname;

    if (p.startsWith('/api/')) {
      if (!rateOk(clientIp(req))) return send(res, 429, { error: 'rate-limited' });

      if (p === '/api/secrets' && req.method === 'POST') {
        return createSecret(res, await readJson(req, MAX_CIPHERTEXT_B64 + 4096));
      }
      if (p === '/api/secrets/plain' && req.method === 'POST') {
        return createPlain(req, res, await readJson(req, 128 * 1024));
      }
      const m = p.match(/^\/api\/secrets\/([A-Za-z0-9_-]{8,64})\/(meta|reveal)$/);
      if (m) {
        if (m[2] === 'meta' && req.method === 'GET') return metaSecret(res, m[1]);
        if (m[2] === 'reveal' && req.method === 'POST') return revealSecret(res, m[1], await readJson(req, 4096).catch(() => ({})));
      }
      return send(res, 404, { error: 'not-found' });
    }

    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, p);
    res.writeHead(405); res.end();
  } catch (e) {
    if (e.message === 'too-large') return send(res, 413, { error: 'too-large' });
    if (e.message === 'bad-json') return send(res, 400, { error: 'bad-json' });
    return send(res, 500, { error: 'server-error' });
  }
});

server.listen(PORT, () => {
  console.log(`PassOnce auf :${PORT}  (DB: ${DB_PATH}, server-encrypt: ${ALLOW_SERVER_ENCRYPT ? 'an' : 'aus'})`);
});
