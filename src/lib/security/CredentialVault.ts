import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SCRYPT_SALT = "texas-funds-credential-vault-v1";

/**
 * AES-256-GCM encryption for Texas dashboard credentials at rest.
 * Stored format: base64(iv || authTag || ciphertext)
 */
export class CredentialVault {
  private readonly key: Buffer;

  constructor(secret = process.env.CREDENTIALS_ENCRYPTION_KEY) {
    if (!secret || secret.length < 16) {
      throw new Error(
        "CREDENTIALS_ENCRYPTION_KEY must be set (min 16 characters)"
      );
    }
    this.key = deriveKey(secret);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString("base64");
  }

  decrypt(payload: string): string {
    const buffer = Buffer.from(payload, "base64");
    if (buffer.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new Error("Invalid encrypted credential payload");
    }

    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  }
}

function deriveKey(secret: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    return Buffer.from(secret, "hex");
  }

  const base64 = Buffer.from(secret, "base64");
  if (base64.length === KEY_LENGTH) return base64;

  return scryptSync(secret, SCRYPT_SALT, KEY_LENGTH);
}

let vaultSingleton: CredentialVault | null = null;

export function getCredentialVault(): CredentialVault {
  if (!vaultSingleton) vaultSingleton = new CredentialVault();
  return vaultSingleton;
}
