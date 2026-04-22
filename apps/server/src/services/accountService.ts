import crypto from "node:crypto";
import { parse as parseCsv } from "csv-parse/sync";
import { db } from "./database";
import { decryptText, encryptText } from "../lib/crypto";
import { normalizePasswordDefaults } from "../lib/password";
import { createPlatform, listPlatforms } from "./platformService";
import type { PasswordDefaults, SessionContext, VaultAccount } from "../types";

interface AccountInput {
  platformId: string;
  accountLabel: string;
  loginUrl: string;
  username: string;
  password: string;
  notes?: string;
  tags?: string[];
  passwordPolicy?: Partial<PasswordDefaults>;
}

interface AccountRow {
  id: string;
  platformId: string;
  accountLabel: string;
  loginUrl: string;
  usernameEnc: string;
  passwordEnc: string;
  notesEnc: string;
  tags: string;
  passwordPolicy: string;
  createdAt: string;
  updatedAt: string;
  lastRotatedAt: string | null;
}

export interface BrowserCsvImportResult {
  imported: number;
  skipped: number;
  autoCreatedPlatforms: number;
  warnings: string[];
}

function normalizeHeaderKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pickColumnValue(row: Record<string, string>, candidateHeaders: string[]): string {
  const normalizedMap = new Map<string, string>();

  for (const [key, value] of Object.entries(row)) {
    normalizedMap.set(normalizeHeaderKey(key), (value ?? "").trim());
  }

  for (const header of candidateHeaders) {
    const value = normalizedMap.get(normalizeHeaderKey(header));
    if (value) {
      return value;
    }
  }

  return "";
}

function normalizeLoginUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    try {
      return new URL(`https://${trimmed}`).toString();
    } catch {
      return null;
    }
  }
}

function hostnameFromUrl(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

function platformNameFromHostname(hostname: string): string {
  const root = hostname.split(".")[0] ?? hostname;
  return root.charAt(0).toUpperCase() + root.slice(1);
}

function findPlatformIdByHostname(platformByHost: Map<string, string>, hostname: string): string | undefined {
  const exact = platformByHost.get(hostname);
  if (exact) {
    return exact;
  }

  for (const [knownHost, platformId] of platformByHost.entries()) {
    if (hostname.endsWith(`.${knownHost}`) || knownHost.endsWith(`.${hostname}`)) {
      return platformId;
    }
  }

  return undefined;
}

function pushWarning(target: string[], message: string): void {
  if (target.length < 100) {
    target.push(message);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function mapRowToAccount(row: AccountRow, session: SessionContext): VaultAccount {
  return {
    id: row.id,
    platformId: row.platformId,
    accountLabel: row.accountLabel,
    loginUrl: row.loginUrl,
    username: decryptText(row.usernameEnc, session.dek),
    password: decryptText(row.passwordEnc, session.dek),
    notes: decryptText(row.notesEnc, session.dek),
    tags: row.tags ? JSON.parse(row.tags) : [],
    passwordPolicy: normalizePasswordDefaults(JSON.parse(row.passwordPolicy) as PasswordDefaults),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastRotatedAt: row.lastRotatedAt
  };
}

function getRowById(id: string): AccountRow {
  const row = db
    .prepare(
      `SELECT
          id,
          platform_id as platformId,
          account_label as accountLabel,
          login_url as loginUrl,
          username_enc as usernameEnc,
          password_enc as passwordEnc,
          notes_enc as notesEnc,
          tags,
          password_policy as passwordPolicy,
          created_at as createdAt,
          updated_at as updatedAt,
          last_rotated_at as lastRotatedAt
        FROM accounts
        WHERE id = ?`
    )
    .get(id) as AccountRow | undefined;

  if (!row) {
    throw new Error("Account not found.");
  }

  return row;
}

export function listVaultAccounts(session: SessionContext): VaultAccount[] {
  const rows = db
    .prepare(
      `SELECT
          id,
          platform_id as platformId,
          account_label as accountLabel,
          login_url as loginUrl,
          username_enc as usernameEnc,
          password_enc as passwordEnc,
          notes_enc as notesEnc,
          tags,
          password_policy as passwordPolicy,
          created_at as createdAt,
          updated_at as updatedAt,
          last_rotated_at as lastRotatedAt
        FROM accounts
        ORDER BY updated_at DESC`
    )
    .all() as AccountRow[];

  return rows.map((row) => mapRowToAccount(row, session));
}

export function createVaultAccount(session: SessionContext, input: AccountInput): VaultAccount {
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const policy = normalizePasswordDefaults(input.passwordPolicy);

  db.prepare(
    `INSERT INTO accounts
      (id, platform_id, account_label, login_url, username_enc, password_enc, notes_enc, tags, password_policy, created_at, updated_at, last_rotated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.platformId,
    input.accountLabel.trim(),
    input.loginUrl.trim(),
    encryptText(input.username, session.dek),
    encryptText(input.password, session.dek),
    encryptText(input.notes ?? "", session.dek),
    JSON.stringify(input.tags ?? []),
    JSON.stringify(policy),
    timestamp,
    timestamp,
    null
  );

  return mapRowToAccount(getRowById(id), session);
}

export function updateVaultAccount(session: SessionContext, id: string, input: AccountInput): VaultAccount {
  const policy = normalizePasswordDefaults(input.passwordPolicy);

  const result = db
    .prepare(
      `UPDATE accounts
        SET platform_id = ?,
            account_label = ?,
            login_url = ?,
            username_enc = ?,
            password_enc = ?,
            notes_enc = ?,
            tags = ?,
            password_policy = ?,
            updated_at = ?
        WHERE id = ?`
    )
    .run(
      input.platformId,
      input.accountLabel.trim(),
      input.loginUrl.trim(),
      encryptText(input.username, session.dek),
      encryptText(input.password, session.dek),
      encryptText(input.notes ?? "", session.dek),
      JSON.stringify(input.tags ?? []),
      JSON.stringify(policy),
      nowIso(),
      id
    );

  if (result.changes === 0) {
    throw new Error("Account not found.");
  }

  return mapRowToAccount(getRowById(id), session);
}

export function removeVaultAccount(id: string): void {
  const result = db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
  if (result.changes === 0) {
    throw new Error("Account not found.");
  }
}

export function setVaultPassword(
  session: SessionContext,
  accountId: string,
  nextPassword: string,
  policy: PasswordDefaults
): VaultAccount {
  const result = db
    .prepare(
      `UPDATE accounts
        SET password_enc = ?, password_policy = ?, updated_at = ?, last_rotated_at = ?
        WHERE id = ?`
    )
    .run(
      encryptText(nextPassword, session.dek),
      JSON.stringify(normalizePasswordDefaults(policy)),
      nowIso(),
      nowIso(),
      accountId
    );

  if (result.changes === 0) {
    throw new Error("Account not found.");
  }

  return mapRowToAccount(getRowById(accountId), session);
}

export function getVaultAccount(session: SessionContext, accountId: string): VaultAccount {
  return mapRowToAccount(getRowById(accountId), session);
}

export function getRawVaultRows(): unknown[] {
  return db.prepare("SELECT * FROM accounts ORDER BY updated_at DESC").all() as unknown[];
}

export function importVaultAccountsFromBrowserCsv(
  session: SessionContext,
  csvText: string
): BrowserCsvImportResult {
  let rows: Array<Record<string, string>>;

  try {
    rows = parseCsv(csvText, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
      relax_column_count: true
    }) as Array<Record<string, string>>;
  } catch {
    throw new Error("CSV parsing failed. Please upload a valid browser export CSV.");
  }

  if (!rows.length) {
    return {
      imported: 0,
      skipped: 0,
      autoCreatedPlatforms: 0,
      warnings: ["No rows were found in the CSV file."]
    };
  }

  const platformByHost = new Map<string, string>();
  for (const platform of listPlatforms()) {
    try {
      platformByHost.set(hostnameFromUrl(platform.baseUrl), platform.id);
    } catch {
      continue;
    }
  }

  let imported = 0;
  let skipped = 0;
  let autoCreatedPlatforms = 0;
  const warnings: string[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];

    const rawUrl = pickColumnValue(row, [
      "url",
      "website",
      "login_url",
      "login url",
      "origin",
      "formActionOrigin",
      "form action origin"
    ]);

    const rawPassword = pickColumnValue(row, ["password", "pass", "pwd"]);

    if (!rawUrl || !rawPassword) {
      skipped += 1;
      pushWarning(warnings, `Row ${index + 2}: missing URL or password.`);
      continue;
    }

    const loginUrl = normalizeLoginUrl(rawUrl);
    if (!loginUrl) {
      skipped += 1;
      pushWarning(warnings, `Row ${index + 2}: invalid URL \"${rawUrl}\".`);
      continue;
    }

    const hostname = hostnameFromUrl(loginUrl);
    let platformId = findPlatformIdByHostname(platformByHost, hostname);

    if (!platformId) {
      const preferredName = pickColumnValue(row, [
        "name",
        "title",
        "site",
        "website",
        "hostname",
        "host"
      ]);

      const createdPlatform = createPlatform({
        name: preferredName || platformNameFromHostname(hostname),
        baseUrl: `https://${hostname}`,
        tag: "Imported",
        logoUrl: null,
        logoData: null
      });

      platformId = createdPlatform.id;
      platformByHost.set(hostname, platformId);
      autoCreatedPlatforms += 1;
    }

    const username = pickColumnValue(row, [
      "username",
      "user",
      "login",
      "email",
      "userid",
      "user id"
    ]);

    const notes = pickColumnValue(row, ["note", "notes", "comment", "comments", "remarks"]);
    const rawTags = pickColumnValue(row, ["folder", "group", "category", "tag", "tags"]);
    const tags = rawTags
      ? rawTags
          .split(/[;,]/)
          .map((value) => value.trim())
          .filter(Boolean)
      : ["Imported"];

    const accountLabel =
      pickColumnValue(row, ["name", "title", "site", "website"]) ||
      platformNameFromHostname(hostname);

    createVaultAccount(session, {
      platformId,
      accountLabel,
      loginUrl,
      username,
      password: rawPassword,
      notes,
      tags
    });

    imported += 1;
  }

  return {
    imported,
    skipped,
    autoCreatedPlatforms,
    warnings
  };
}
