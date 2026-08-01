/**
 * Advanced Web Crypto API for Asymmetric E2EE (ECDH + AES-GCM).
 */

// Generate an ECDH Public/Private key pair for this user
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

// Export public key to send to the other user
export async function exportPublicKey(key: CryptoKey): Promise<JsonWebKey> {
  return window.crypto.subtle.exportKey('jwk', key);
}

// Import the other user's public key
export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return window.crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

// Derive the shared AES-GCM encryption key using my Private Key + their Public Key
export async function deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return window.crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Create a visual fingerprint hash of the two public keys to verify security
export async function generateSecurityFingerprint(myKeyJwk: JsonWebKey, theirKeyJwk: JsonWebKey): Promise<string> {
  // Sort the keys so both users generate the exact same fingerprint string regardless of order
  const keys = [JSON.stringify(myKeyJwk), JSON.stringify(theirKeyJwk)].sort();
  const data = new TextEncoder().encode(keys.join('|'));
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // Return a chunked hex string e.g. "A1B2-C3D4-E5F6"
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

// Encrypt a string (text or base64 photo) using the derived AES-GCM key
export async function encryptData(key: CryptoKey, data: string): Promise<{ ciphertext: string, iv: string }> {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const encryptedBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    enc.encode(data)
  );

  const ciphertext = arrayBufferToBase64(encryptedBuf);
  const ivStr = arrayBufferToBase64(iv.buffer);
  
  return { ciphertext, iv: ivStr };
}

// Decrypt a string
export async function decryptData(key: CryptoKey, ciphertextBase64: string, ivBase64: string): Promise<string> {
  const ciphertextBuf = base64ToArrayBuffer(ciphertextBase64);
  const ivBuf = base64ToArrayBuffer(ivBase64);

  const decryptedBuf = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(ivBuf) },
    key,
    ciphertextBuf
  );

  return new TextDecoder().decode(decryptedBuf);
}

// Helpers
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}
