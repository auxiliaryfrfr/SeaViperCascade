import crypto from "node:crypto";
import Database from "better-sqlite3";
import { APP_NAME, DB_PATH, ensureFilesystemLayout } from "../config";
import { normalizePasswordDefaults } from "../lib/password";
import type { AppSettings } from "../types";

ensureFilesystemLayout();

export const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const createTablesSql = `
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platforms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  tag TEXT NOT NULL,
  logo_url TEXT,
  logo_data TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  account_label TEXT NOT NULL,
  login_url TEXT NOT NULL,
  username_enc TEXT NOT NULL,
  password_enc TEXT NOT NULL,
  notes_enc TEXT NOT NULL,
  tags TEXT NOT NULL,
  password_policy TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_rotated_at TEXT,
  FOREIGN KEY(platform_id) REFERENCES platforms(id) ON DELETE CASCADE
);
`;

db.exec(createTablesSql);

export function getMetadata(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM metadata WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setMetadata(key: string, value: string): void {
  db.prepare(
    "INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export function setManyMetadata(entries: Record<string, string>): void {
  const insert = db.prepare(
    "INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );

  const transaction = db.transaction(() => {
    for (const [key, value] of Object.entries(entries)) {
      insert.run(key, value);
    }
  });

  transaction();
}

export function isVaultInitialized(): boolean {
  return getMetadata("vault_initialized") === "true";
}

export function getInstallId(): string {
  let installId = getMetadata("install_id");
  if (!installId) {
    installId = crypto.randomUUID();
    setMetadata("install_id", installId);
  }

  return installId;
}

export function getSettings(): AppSettings {
  const raw = getMetadata("app_settings");
  if (!raw) {
    const defaults: AppSettings = {
      themeMode: "dark",
      customTheme: null,
      logoutAllDevicesDefault: true,
      rememberMeDefault: true,
      passwordDefaults: normalizePasswordDefaults({
        length: 16,
        includeUppercase: true,
        includeLowercase: true,
        includeNumbers: true,
        includeSymbols: true
      })
    };

    setMetadata("app_settings", JSON.stringify(defaults));
    setMetadata("app_name", APP_NAME);
    return defaults;
  }

  const parsed = JSON.parse(raw) as AppSettings;
  parsed.passwordDefaults = normalizePasswordDefaults(parsed.passwordDefaults);
  return parsed;
}

export function saveSettings(settings: AppSettings): void {
  setMetadata("app_settings", JSON.stringify(settings));
}
