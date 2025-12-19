import nacl from "tweetnacl";
import {
  decodeUTF8,
  encodeUTF8,
  encodeBase64,
  decodeBase64,
} from "tweetnacl-util";

// Generate a new key pair for the user
export function generateKeyPair() {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: encodeBase64(keyPair.publicKey),
    secretKey: encodeBase64(keyPair.secretKey),
  };
}

// Encrypt a message using the recipient's public key and sender's secret key
export function encryptMessage(
  message: string,
  recipientPublicKey: string,
  senderSecretKey: string
): { encrypted: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const messageUint8 = decodeUTF8(message);
  const recipientPublicKeyUint8 = decodeBase64(recipientPublicKey);
  const senderSecretKeyUint8 = decodeBase64(senderSecretKey);

  const encrypted = nacl.box(
    messageUint8,
    nonce,
    recipientPublicKeyUint8,
    senderSecretKeyUint8
  );

  if (!encrypted) {
    throw new Error("Encryption failed");
  }

  return {
    encrypted: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
  };
}

// Decrypt a message using the sender's public key and recipient's secret key
export function decryptMessage(
  encryptedMessage: string,
  nonce: string,
  senderPublicKey: string,
  recipientSecretKey: string
): string {
  const encryptedUint8 = decodeBase64(encryptedMessage);
  const nonceUint8 = decodeBase64(nonce);
  const senderPublicKeyUint8 = decodeBase64(senderPublicKey);
  const recipientSecretKeyUint8 = decodeBase64(recipientSecretKey);

  const decrypted = nacl.box.open(
    encryptedUint8,
    nonceUint8,
    senderPublicKeyUint8,
    recipientSecretKeyUint8
  );

  if (!decrypted) {
    throw new Error("Decryption failed");
  }

  return encodeUTF8(decrypted);
}

// Decrypt using a precomputed shared key so either party (you + other user) can decrypt
// with their own secret key and the other party's public key.
export function decryptMessageWithOtherPublic(
  encryptedMessage: string,
  nonce: string,
  otherPublicKey: string,
  mySecretKey: string
): string {
  const encryptedUint8 = decodeBase64(encryptedMessage);
  const nonceUint8 = decodeBase64(nonce);
  const otherPublicKeyUint8 = decodeBase64(otherPublicKey);
  const mySecretKeyUint8 = decodeBase64(mySecretKey);

  // Compute shared key between me (secret) and other (public)
  const sharedKey = nacl.box.before(otherPublicKeyUint8, mySecretKeyUint8);
  const decrypted = nacl.box.open.after(encryptedUint8, nonceUint8, sharedKey);

  if (!decrypted) {
    throw new Error("Decryption failed");
  }

  return encodeUTF8(decrypted);
}

// Store keys in localStorage
export function storeKeys(publicKey: string, secretKey: string) {
  localStorage.setItem("publicKey", publicKey);
  localStorage.setItem("secretKey", secretKey);
}

// Retrieve keys from localStorage
export function getKeys(): { publicKey: string; secretKey: string } | null {
  const publicKey = localStorage.getItem("publicKey");
  const secretKey = localStorage.getItem("secretKey");

  if (!publicKey || !secretKey) {
    return null;
  }

  return { publicKey, secretKey };
}

// Clear keys from localStorage
export function clearKeys() {
  localStorage.removeItem("publicKey");
  localStorage.removeItem("secretKey");
}

// ============ Key Export/Import for Cross-Device Sync ============

export interface ExportedKeys {
  version: number;
  salt: string;
  iv: string;
  encryptedData: string;
  publicKey: string;
}

// Derive encryption key from password using PBKDF2
async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Export keys encrypted with a password
export async function exportKeysWithPassword(
  password: string
): Promise<ExportedKeys> {
  const keys = getKeys();
  if (!keys) {
    throw new Error("No keys to export");
  }

  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Derive encryption key from password
  const encryptionKey = await deriveKeyFromPassword(password, salt);

  // Encrypt the secret key (we don't need to encrypt public key as it's... public)
  const encoder = new TextEncoder();
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    encryptionKey,
    encoder.encode(keys.secretKey)
  );

  return {
    version: 1,
    salt: encodeBase64(salt),
    iv: encodeBase64(iv),
    encryptedData: encodeBase64(new Uint8Array(encryptedBuffer)),
    publicKey: keys.publicKey,
  };
}

// Import keys from encrypted export
export async function importKeysWithPassword(
  exportedKeys: ExportedKeys,
  password: string
): Promise<{ publicKey: string; secretKey: string }> {
  if (exportedKeys.version !== 1) {
    throw new Error("Unsupported export version");
  }

  const salt = decodeBase64(exportedKeys.salt);
  const iv = decodeBase64(exportedKeys.iv);
  const encryptedData = decodeBase64(exportedKeys.encryptedData);

  // Derive decryption key from password
  const decryptionKey = await deriveKeyFromPassword(password, salt);

  // Decrypt the secret key
  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      decryptionKey,
      encryptedData
    );

    const decoder = new TextDecoder();
    const secretKey = decoder.decode(decryptedBuffer);

    // Store the imported keys
    const keys = {
      publicKey: exportedKeys.publicKey,
      secretKey,
    };
    storeKeys(keys.publicKey, keys.secretKey);

    return keys;
  } catch {
    throw new Error("Invalid password or corrupted export file");
  }
}

// Download keys as encrypted JSON file
export async function downloadEncryptedKeys(password: string): Promise<void> {
  const exported = await exportKeysWithPassword(password);
  const blob = new Blob([JSON.stringify(exported, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `chat-encryption-keys-${
    new Date().toISOString().split("T")[0]
  }.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
