-- Secret (self-hosted) — SQLite-Schema.
-- Speichert ausschliesslich Ciphertext. Schluessel/Klartext liegen nie auf dem Server.

CREATE TABLE IF NOT EXISTS secrets (
  id_hash          TEXT PRIMARY KEY,   -- SHA-256(url-id) als hex; Klartext-id wird nie gespeichert
  ciphertext       TEXT NOT NULL,      -- AES-256-GCM Ciphertext (inkl. Auth-Tag), Base64
  iv               TEXT NOT NULL,      -- 12 Byte IV, Base64
  salt             TEXT,               -- 16 Byte PBKDF2-Salt, Base64 (nur bei Passphrase)
  verifier         TEXT,               -- SHA-256(finalKey) hex (nur bei Passphrase)
  needs_passphrase INTEGER NOT NULL DEFAULT 0,
  expires_at       INTEGER NOT NULL,   -- Unix-Epoch (Sekunden)
  created_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_secrets_expires ON secrets(expires_at);
