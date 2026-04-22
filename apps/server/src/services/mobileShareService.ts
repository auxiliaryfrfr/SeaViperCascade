import { MOBILE_SHARE_TTL_MS } from "../config";
import { randomBase64Url } from "../lib/crypto";
import { createSession, getSession } from "./sessionStore";

interface PendingMobileToken {
  sourceSessionToken: string;
  expiresAt: number;
}

const pendingTokens = new Map<string, PendingMobileToken>();

function cleanupExpired(): void {
  const now = Date.now();
  for (const [token, value] of pendingTokens.entries()) {
    if (value.expiresAt <= now) {
      pendingTokens.delete(token);
    }
  }
}

export function createMobileShareToken(sourceSessionToken: string): string {
  cleanupExpired();

  const token = randomBase64Url(24);
  pendingTokens.set(token, {
    sourceSessionToken,
    expiresAt: Date.now() + MOBILE_SHARE_TTL_MS
  });

  return token;
}

export function consumeMobileShareToken(token: string): string {
  cleanupExpired();

  const pending = pendingTokens.get(token);
  if (!pending) {
    throw new Error("Token is invalid or expired.");
  }

  pendingTokens.delete(token);

  const sourceSession = getSession(pending.sourceSessionToken);
  if (!sourceSession) {
    throw new Error("Source session is no longer active.");
  }

  const mobileSession = createSession(sourceSession.dek, { mobile: true, recoveryUnlocked: false });
  return mobileSession.token;
}
