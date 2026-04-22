import crypto from "node:crypto";

const AES_ALGORITHM = "aes-256-gcm";

interface CipherPayload {
  version: "v1";
  iv: string;
  tag: string;
  data: string;
}

function encode(payload: CipherPayload): string {
  return [payload.version, payload.iv, payload.tag, payload.data].join(".");
}

function decode(raw: string): CipherPayload {
  const [version, iv, tag, data] = raw.split(".");
  if (version !== "v1" || !iv || !tag || !data) {
    throw new Error("Invalid encrypted payload format.");
  }

  return {
    version,
    iv,
    tag,
    data
  };
}

export function randomBase64Url(bytes: number): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function createSalt(): string {
  return randomBase64Url(16);
}

export async function deriveKey(password: string, saltBase64Url: string): Promise<Buffer> {
  if (!password || password.length < 8) {
    throw new Error("Master password must be at least 8 characters.");
  }

  const salt = Buffer.from(saltBase64Url, "base64url");
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      32,
      {
        N: 32768,
        r: 8,
        p: 1,
        maxmem: 256 * 1024 * 1024
      },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(Buffer.from(key));
      }
    );
  });

  return Buffer.from(derived);
}

export function encryptBuffer(plain: Buffer, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(AES_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();

  return encode({
    version: "v1",
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    data: encrypted.toString("base64url")
  });
}

export function decryptBuffer(cipherText: string, key: Buffer): Buffer {
  const payload = decode(cipherText);
  const decipher = crypto.createDecipheriv(
    AES_ALGORITHM,
    key,
    Buffer.from(payload.iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64url")),
    decipher.final()
  ]);
}

export function encryptText(plain: string, key: Buffer): string {
  return encryptBuffer(Buffer.from(plain, "utf8"), key);
}

export function decryptText(cipherText: string, key: Buffer): string {
  return decryptBuffer(cipherText, key).toString("utf8");
}

export function sha256Base64Url(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("base64url");
}

export function wipeBuffer(buffer: Buffer): void {
  buffer.fill(0);
}
