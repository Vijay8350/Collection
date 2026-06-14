import crypto from "node:crypto";

// AES-256-GCM encryption for shop access tokens at rest.
// Key must be 32 bytes (hex-encoded → 64 chars). Generate with:
//   openssl rand -hex 32

function getKey(): Buffer {
  const hex = process.env.SHOP_TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    // For dev convenience, derive a stable dev key. Production MUST set the env var.
    if (process.env.NODE_ENV !== "production") {
      return crypto.createHash("sha256").update("dev-only-do-not-use-in-prod").digest();
    }
    throw new Error("SHOP_TOKEN_ENCRYPTION_KEY must be 32 bytes hex-encoded");
  }
  return Buffer.from(hex, "hex");
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptToken(enc: string): string {
  const [ivB64, tagB64, ctB64] = enc.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return plain.toString("utf8");
}
