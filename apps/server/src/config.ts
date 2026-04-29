import fs from "node:fs";
import path from "node:path";

const packageRoot = process.env.SVC_SERVER_ROOT
  ? path.resolve(process.env.SVC_SERVER_ROOT)
  : path.resolve(__dirname, "..");

export const APP_NAME = "SVC - SeaViperCascade";
export const HOST = process.env.SVC_HOST ?? "127.0.0.1";
export const PORT = Number(process.env.SVC_PORT ?? 8787);
export const WEB_DEV_ORIGIN = process.env.SVC_WEB_ORIGIN ?? "http://localhost:5173";
export const TRUSTED_ORIGINS = (process.env.SVC_TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const DATA_DIR = path.join(packageRoot, "data");
export const DB_PATH = path.join(DATA_DIR, "svc-vault.db");
export const RECOVERY_DIR = path.join(packageRoot, "recovery-kits");

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const MOBILE_SHARE_TTL_MS = 5 * 60 * 1000;
export const AUTOMATION_JOB_TTL_MS = 30 * 60 * 1000;
export const CSV_TEXT_MAX_BYTES = 5 * 1024 * 1024;
export const CSV_IMPORT_MAX_ROWS = 5000;
export const LOGO_DATA_MAX_BYTES = 512 * 1024;
export const THEME_VALUE_MAX_LENGTH = 240;
export const RECOVERY_BLOB_MAX_BYTES = 20 * 1024 * 1024;

export const CANARY_TEXT = "auth_success";

export function ensureFilesystemLayout(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(RECOVERY_DIR, { recursive: true });
}
