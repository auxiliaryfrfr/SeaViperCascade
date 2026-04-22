import crypto from "node:crypto";
import { db } from "./database";
import { SEED_PLATFORMS } from "../lib/platformCatalog";
import type { PlatformRecord } from "../types";

interface PlatformInput {
  name: string;
  baseUrl: string;
  tag: string;
  logoUrl?: string | null;
  logoData?: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.toString();
  } catch {
    throw new Error("Invalid URL. Please include protocol, e.g. https://example.com");
  }
}

function fallbackLogoUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=128`;
}

export function listPlatforms(): PlatformRecord[] {
  return db
    .prepare(
      `SELECT
          id,
          name,
          base_url as baseUrl,
          tag,
          logo_url as logoUrl,
          logo_data as logoData,
          created_at as createdAt,
          updated_at as updatedAt
        FROM platforms
        ORDER BY name ASC`
    )
    .all() as PlatformRecord[];
}

export function ensureSeedPlatforms(): void {
  const row = db.prepare("SELECT COUNT(*) as total FROM platforms").get() as { total: number };
  if (row.total > 0) {
    return;
  }

  const insert = db.prepare(
    `INSERT INTO platforms
      (id, name, base_url, tag, logo_url, logo_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const transaction = db.transaction(() => {
    for (const platform of SEED_PLATFORMS) {
      const timestamp = nowIso();
      insert.run(
        crypto.randomUUID(),
        platform.name,
        platform.baseUrl,
        platform.tag,
        fallbackLogoUrl(platform.baseUrl),
        null,
        timestamp,
        timestamp
      );
    }
  });

  transaction();
}

export function createPlatform(input: PlatformInput): PlatformRecord {
  const timestamp = nowIso();
  const id = crypto.randomUUID();
  const baseUrl = normalizeUrl(input.baseUrl);
  const logoUrl = input.logoUrl || fallbackLogoUrl(baseUrl);

  db.prepare(
    `INSERT INTO platforms
      (id, name, base_url, tag, logo_url, logo_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.name.trim(), baseUrl, input.tag.trim(), logoUrl, input.logoData ?? null, timestamp, timestamp);

  return db
    .prepare(
      `SELECT
          id,
          name,
          base_url as baseUrl,
          tag,
          logo_url as logoUrl,
          logo_data as logoData,
          created_at as createdAt,
          updated_at as updatedAt
        FROM platforms WHERE id = ?`
    )
    .get(id) as PlatformRecord;
}

export function updatePlatform(id: string, input: PlatformInput): PlatformRecord {
  const baseUrl = normalizeUrl(input.baseUrl);
  const logoUrl = input.logoUrl || fallbackLogoUrl(baseUrl);

  const result = db
    .prepare(
      `UPDATE platforms
        SET name = ?, base_url = ?, tag = ?, logo_url = ?, logo_data = ?, updated_at = ?
        WHERE id = ?`
    )
    .run(
      input.name.trim(),
      baseUrl,
      input.tag.trim(),
      logoUrl,
      input.logoData ?? null,
      nowIso(),
      id
    );

  if (result.changes === 0) {
    throw new Error("Platform not found.");
  }

  return db
    .prepare(
      `SELECT
          id,
          name,
          base_url as baseUrl,
          tag,
          logo_url as logoUrl,
          logo_data as logoData,
          created_at as createdAt,
          updated_at as updatedAt
        FROM platforms WHERE id = ?`
    )
    .get(id) as PlatformRecord;
}

export function removePlatform(id: string): void {
  const result = db.prepare("DELETE FROM platforms WHERE id = ?").run(id);
  if (result.changes === 0) {
    throw new Error("Platform not found.");
  }
}
