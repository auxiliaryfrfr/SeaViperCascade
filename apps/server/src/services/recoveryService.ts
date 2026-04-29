import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { RECOVERY_DIR } from "../config";
import { createSalt, decryptBuffer, deriveKey, encryptBuffer, randomBase64Url, sha256Base64Url, wipeBuffer } from "../lib/crypto";
import { db } from "./database";
import type { RecoveryBlob } from "../types";

interface Snapshot {
  metadata: Array<{ key: string; value: string }>;
  platforms: Array<Record<string, unknown>>;
  accounts: Array<Record<string, unknown>>;
  createdAt: string;
}

interface RecoveryKitResult {
  fileName: string;
  filePath: string;
  blob: RecoveryBlob;
  pdfBase64: string;
}

const BLOB_BEGIN = "-----BEGIN SVC RECOVERY BLOB-----";
const BLOB_END = "-----END SVC RECOVERY BLOB-----";

function takeSnapshot(): Snapshot {
  const metadata = db.prepare("SELECT key, value FROM metadata ORDER BY key ASC").all() as Array<{
    key: string;
    value: string;
  }>;

  const platforms = db.prepare("SELECT * FROM platforms ORDER BY name ASC").all() as Array<
    Record<string, unknown>
  >;

  const accounts = db.prepare("SELECT * FROM accounts ORDER BY updated_at DESC").all() as Array<
    Record<string, unknown>
  >;

  return {
    metadata,
    platforms,
    accounts,
    createdAt: new Date().toISOString()
  };
}

function applySnapshot(snapshot: Snapshot): void {
  if (!Array.isArray(snapshot.metadata) || !Array.isArray(snapshot.platforms) || !Array.isArray(snapshot.accounts)) {
    throw new Error("Recovery snapshot is missing required sections.");
  }

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM accounts").run();
    db.prepare("DELETE FROM platforms").run();
    db.prepare("DELETE FROM metadata").run();

    const metadataInsert = db.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
    for (const item of snapshot.metadata) {
      metadataInsert.run(item.key, item.value);
    }

    const platformInsert = db.prepare(
      `INSERT INTO platforms
      (id, name, base_url, tag, logo_url, logo_data, created_at, updated_at)
      VALUES (@id, @name, @base_url, @tag, @logo_url, @logo_data, @created_at, @updated_at)`
    );

    for (const platform of snapshot.platforms) {
      platformInsert.run(platform as Record<string, unknown>);
    }

    const accountInsert = db.prepare(
      `INSERT INTO accounts
      (id, platform_id, account_label, login_url, username_enc, password_enc, notes_enc, tags, password_policy, created_at, updated_at, last_rotated_at)
      VALUES (@id, @platform_id, @account_label, @login_url, @username_enc, @password_enc, @notes_enc, @tags, @password_policy, @created_at, @updated_at, @last_rotated_at)`
    );

    for (const account of snapshot.accounts) {
      accountInsert.run(account as Record<string, unknown>);
    }
  });

  tx();
}

function createArmoredBlob(blob: RecoveryBlob): string {
  return `${BLOB_BEGIN}\n${JSON.stringify(blob, null, 2)}\n${BLOB_END}`;
}

function parseArmoredBlob(raw: string): RecoveryBlob {
  const begin = raw.indexOf(BLOB_BEGIN);
  const end = raw.indexOf(BLOB_END);

  if (begin < 0 || end < 0 || end <= begin) {
    throw new Error("Recovery blob block markers were not found.");
  }

  const json = raw.slice(begin + BLOB_BEGIN.length, end).trim();
  const parsed = JSON.parse(json) as RecoveryBlob;

  if (parsed.version !== "SVC-KIT-1") {
    throw new Error("Unsupported recovery blob version.");
  }

  return parsed;
}

function wrapLines(value: string, lineLength = 96): string[] {
  const lines: string[] = [];
  for (let i = 0; i < value.length; i += lineLength) {
    lines.push(value.slice(i, i + lineLength));
  }

  return lines;
}

async function encryptSnapshot(snapshot: Snapshot, passphrase: string): Promise<RecoveryBlob> {
  if (passphrase.length < 12) {
    throw new Error("Recovery kit passphrase must be at least 12 characters.");
  }

  const salt = createSalt();
  const key = await deriveKey(passphrase, salt);

  try {
    const payload = Buffer.from(JSON.stringify(snapshot), "utf8");
    const cipherText = encryptBuffer(payload, key);

    return {
      version: "SVC-KIT-1",
      createdAt: snapshot.createdAt,
      salt,
      cipherText,
      checksum: sha256Base64Url(payload)
    };
  } finally {
    wipeBuffer(key);
  }
}

async function decryptSnapshot(blob: RecoveryBlob, passphrase: string): Promise<Snapshot> {
  const key = await deriveKey(passphrase, blob.salt);

  try {
    const payload = decryptBuffer(blob.cipherText, key);
    const checksum = sha256Base64Url(payload);
    if (checksum !== blob.checksum) {
      throw new Error("Checksum mismatch. Recovery blob appears tampered or passphrase is invalid.");
    }

    return JSON.parse(payload.toString("utf8")) as Snapshot;
  } finally {
    wipeBuffer(key);
  }
}

async function renderPdf(blob: RecoveryBlob): Promise<Buffer> {
  const armored = createArmoredBlob(blob);

  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 42, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text("SeaViperCascade Emergency Recovery Kit", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Created: ${blob.createdAt}`);
    doc.text("Format: SVC-KIT-1");
    doc.text("This block contains an encrypted snapshot of your vault database.");
    doc.text("Keep it offline and only decrypt using the passphrase you set during export.");
    doc.moveDown();

    doc.font("Courier").fontSize(8);
    for (const line of wrapLines(armored, 92)) {
      doc.text(line);
    }

    doc.moveDown();
    doc.font("Helvetica").fontSize(10);
    doc.text("Restore steps:");
    doc.text("1. Open SVC and go to Recovery > Import Recovery Kit.");
    doc.text("2. Paste the full armored block from this document.");
    doc.text("3. Enter the recovery kit passphrase used during export.");

    doc.end();
  });
}

export async function generateRecoveryKit(passphrase: string): Promise<RecoveryKitResult> {
  const snapshot = takeSnapshot();
  const blob = await encryptSnapshot(snapshot, passphrase);
  const pdfBuffer = await renderPdf(blob);

  const fileName = `svc-recovery-${Date.now()}-${randomBase64Url(6)}.pdf`;
  const filePath = path.join(RECOVERY_DIR, fileName);

  fs.writeFileSync(filePath, pdfBuffer, { flag: "wx", mode: 0o600 });

  return {
    fileName,
    filePath,
    blob,
    pdfBase64: pdfBuffer.toString("base64")
  };
}

export async function restoreFromRecoveryBlob(armoredBlob: string, passphrase: string): Promise<void> {
  const blob = parseArmoredBlob(armoredBlob);
  const snapshot = await decryptSnapshot(blob, passphrase);
  applySnapshot(snapshot);
}

export function createRecoveryText(blob: RecoveryBlob): string {
  return createArmoredBlob(blob);
}
