/* Secret — Zero-Knowledge-Krypto im Browser (Web Crypto API).
 * Der Schluessel verlaesst den Browser nie; der Server sieht nur Ciphertext.
 *
 *   K            = 32 zufaellige Bytes (steckt nur im URL-Fragment)
 *   keyMaterial  = K                                   (ohne Passphrase)
 *                = SHA-256( K || PBKDF2(pass, salt) )  (mit Passphrase)
 *   AES-Key      = AES-256-GCM(keyMaterial)
 *   verifier     = SHA-256( keyMaterial || "integrisec-verify" )  (nur bei Passphrase)
 */
(() => {
  'use strict';

  const PBKDF2_ITERS = 600000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function bytesToB64(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let bin = '';
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin);
  }
  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64url(bytes) {
    return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlToBytes(s) {
    let t = s.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    return b64ToBytes(t);
  }

  async function sha256(bytes) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  }
  const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  function concat(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  async function deriveKeyMaterial(K, passphrase, salt) {
    if (!passphrase) return K;
    const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits']);
    const pbkdf2 = new Uint8Array(
      await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERS }, base, 256)
    );
    return sha256(concat(K, pbkdf2));
  }
  const importAesKey = (km) => crypto.subtle.importKey('raw', km, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const computeVerifier = async (km) => toHex(await sha256(concat(km, enc.encode('integrisec-verify'))));

  async function encryptSecret(plaintext, passphrase) {
    const K = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const salt = passphrase ? crypto.getRandomValues(new Uint8Array(16)) : null;
    const keyMaterial = await deriveKeyMaterial(K, passphrase, salt);
    const key = await importAesKey(keyMaterial);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext)));
    return {
      K,
      payload: {
        ciphertext: bytesToB64(ct),
        iv: bytesToB64(iv),
        salt: salt ? bytesToB64(salt) : null,
        verifier: passphrase ? await computeVerifier(keyMaterial) : null,
        needs_passphrase: !!passphrase,
      },
    };
  }

  async function decryptSecret(payload, K, passphrase, saltB64) {
    const salt = saltB64 ? b64ToBytes(saltB64) : null;
    const key = await importAesKey(await deriveKeyMaterial(K, passphrase, salt));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(payload.iv) }, key, b64ToBytes(payload.ciphertext));
    return dec.decode(pt);
  }

  async function verifierFor(K, passphrase, saltB64) {
    const salt = saltB64 ? b64ToBytes(saltB64) : null;
    return computeVerifier(await deriveKeyMaterial(K, passphrase, salt));
  }

  window.PassOnceCrypto = { encryptSecret, decryptSecret, verifierFor, bytesToB64url, b64urlToBytes };
})();
