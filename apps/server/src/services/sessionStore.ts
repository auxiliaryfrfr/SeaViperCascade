import { SESSION_TTL_MS } from "../config";
import { randomBase64Url, wipeBuffer } from "../lib/crypto";
import type { SessionContext } from "../types";

const sessions = new Map<string, SessionContext>();

function now(): number {
  return Date.now();
}

function cloneKey(key: Buffer): Buffer {
  return Buffer.from(key);
}

export function createSession(
  dek: Buffer,
  options?: { mobile?: boolean; recoveryUnlocked?: boolean }
): SessionContext {
  const token = randomBase64Url(32);
  const createdAt = now();

  const context: SessionContext = {
    token,
    dek: cloneKey(dek),
    createdAt,
    expiresAt: createdAt + SESSION_TTL_MS,
    mobile: options?.mobile ?? false,
    recoveryUnlocked: options?.recoveryUnlocked ?? false
  };

  sessions.set(token, context);
  return context;
}

export function getSession(token: string): SessionContext | undefined {
  const context = sessions.get(token);
  if (!context) {
    return undefined;
  }

  if (context.expiresAt <= now()) {
    revokeSession(token);
    return undefined;
  }

  context.expiresAt = now() + SESSION_TTL_MS;
  return context;
}

export function revokeSession(token: string): void {
  const context = sessions.get(token);
  if (!context) {
    return;
  }

  wipeBuffer(context.dek);
  sessions.delete(token);
}

export function revokeAllSessions(): void {
  for (const token of sessions.keys()) {
    revokeSession(token);
  }
}

process.on("SIGINT", () => {
  revokeAllSessions();
  process.exit(0);
});

process.on("SIGTERM", () => {
  revokeAllSessions();
  process.exit(0);
});

process.on("exit", () => {
  revokeAllSessions();
});
