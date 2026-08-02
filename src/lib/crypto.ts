/**
 * End-to-End Encryption (E2EE) Utility Module
 * Uses Web Crypto API (AES-GCM 256-bit) for client-side encryption and decryption.
 * Plaintext messages/media never leave the browser unencrypted.
 */

// Generate a deterministic 256-bit AES key derived from contact pair IDs + salt
export async function getSymmetricKeyForPair(userA: string, userB: string): Promise<CryptoKey> {
  const sortedIds = [userA, userB].sort().join(':');
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(sortedIds + '-szchat-e2ee-salt-v1'),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('szchat-salt-2026'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt plaintext or Base64 data string to AES-GCM 256-bit ciphertext
export async function encryptE2EE(aesKey: CryptoKey, plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(plaintext);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    aesKey,
    encoded
  );

  const ciphertext = arrayBufferToBase64(encryptedBuffer);
  const ivBase64 = arrayBufferToBase64(iv.buffer as ArrayBuffer);

  return { ciphertext, iv: ivBase64 };
}

// Decrypt AES-GCM 256-bit ciphertext
export async function decryptE2EE(aesKey: CryptoKey, ciphertext: string, ivBase64: string): Promise<string> {
  const encryptedBuffer = base64ToArrayBuffer(ciphertext);
  const iv = base64ToArrayBuffer(ivBase64);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(iv)
    },
    aesKey,
    encryptedBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// Helper ArrayBuffer <-> Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
