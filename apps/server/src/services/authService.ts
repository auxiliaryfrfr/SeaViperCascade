import crypto from "node:crypto";
import { CANARY_TEXT } from "../config";
import { createSalt, decryptBuffer, decryptText, deriveKey, encryptBuffer, encryptText, randomBase64Url, wipeBuffer } from "../lib/crypto";
import { ensureSeedPlatforms } from "./platformService";
import { createSession, revokeAllSessions } from "./sessionStore";
import { getMetadata, isVaultInitialized, setManyMetadata } from "./database";

interface UnlockResponse {
  token: string;
  recoveryUnlocked: boolean;
  mobile: boolean;
}

function validateMaster(masterPassword: string): void {
  if (!masterPassword || masterPassword.length < 12) {
    throw new Error("Master password must be at least 12 characters long.");
  }
}

function generateRecoveryCode(): string {
  const sanitized = randomBase64Url(24).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return sanitized
    .slice(0, 24)
    .match(/.{1,4}/g)
    ?.join("-") ?? sanitized;
}

function getRequiredMetadata(key: string): string {
  const value = getMetadata(key);
  if (!value) {
    throw new Error(`Missing vault metadata: ${key}`);
  }

  return value;
}

export function getVaultState(): { initialized: boolean } {
  return {
    initialized: isVaultInitialized()
  };
}

export async function bootstrapVault(masterPassword: string): Promise<{ recoveryCode: string }> {
  if (isVaultInitialized()) {
    throw new Error("Vault is already initialized.");
  }

  validateMaster(masterPassword);

  const masterSalt = createSalt();
  const recoverySalt = createSalt();
  const recoveryCode = generateRecoveryCode();

  const masterKey = await deriveKey(masterPassword, masterSalt);
  const recoveryKey = await deriveKey(recoveryCode, recoverySalt);
  const dek = crypto.randomBytes(32);

  try {
    const canary = encryptText(CANARY_TEXT, masterKey);
    const wrappedDek = encryptBuffer(dek, masterKey);
    const wrappedDekRecovery = encryptBuffer(dek, recoveryKey);

    setManyMetadata({
      vault_initialized: "true",
      master_salt: masterSalt,
      recovery_salt: recoverySalt,
      canary,
      wrapped_dek: wrappedDek,
      wrapped_dek_recovery: wrappedDekRecovery,
      created_at: new Date().toISOString()
    });

    ensureSeedPlatforms();
  } finally {
    wipeBuffer(masterKey);
    wipeBuffer(recoveryKey);
    wipeBuffer(dek);
  }

  return { recoveryCode };
}

export async function unlockWithMaster(masterPassword: string): Promise<UnlockResponse> {
  if (!isVaultInitialized()) {
    throw new Error("Vault has not been initialized.");
  }

  const masterSalt = getRequiredMetadata("master_salt");
  const canaryCipher = getRequiredMetadata("canary");
  const wrappedDek = getRequiredMetadata("wrapped_dek");

  const masterKey = await deriveKey(masterPassword, masterSalt);

  try {
    const canary = decryptText(canaryCipher, masterKey);
    if (canary !== CANARY_TEXT) {
      throw new Error("Invalid master password.");
    }

    const dek = decryptBuffer(wrappedDek, masterKey);
    try {
      const session = createSession(dek, { mobile: false, recoveryUnlocked: false });
      return {
        token: session.token,
        recoveryUnlocked: false,
        mobile: false
      };
    } finally {
      wipeBuffer(dek);
    }
  } catch {
    throw new Error("Invalid master password.");
  } finally {
    wipeBuffer(masterKey);
  }
}

export async function unlockWithRecoveryCode(recoveryCode: string): Promise<UnlockResponse> {
  if (!isVaultInitialized()) {
    throw new Error("Vault has not been initialized.");
  }

  const recoverySalt = getRequiredMetadata("recovery_salt");
  const wrappedDekRecovery = getRequiredMetadata("wrapped_dek_recovery");

  const recoveryKey = await deriveKey(recoveryCode, recoverySalt);

  try {
    const dek = decryptBuffer(wrappedDekRecovery, recoveryKey);

    try {
      const session = createSession(dek, { mobile: false, recoveryUnlocked: true });
      return {
        token: session.token,
        recoveryUnlocked: true,
        mobile: false
      };
    } finally {
      wipeBuffer(dek);
    }
  } catch {
    throw new Error("Invalid recovery code.");
  } finally {
    wipeBuffer(recoveryKey);
  }
}

export async function resetMasterFromRecovery(
  sessionToken: string,
  newMasterPassword: string,
  dek: Buffer
): Promise<void> {
  validateMaster(newMasterPassword);

  const masterSalt = createSalt();
  const masterKey = await deriveKey(newMasterPassword, masterSalt);

  try {
    const canary = encryptText(CANARY_TEXT, masterKey);
    const wrappedDek = encryptBuffer(dek, masterKey);

    setManyMetadata({
      master_salt: masterSalt,
      canary,
      wrapped_dek: wrappedDek,
      updated_at: new Date().toISOString()
    });
  } finally {
    wipeBuffer(masterKey);
  }

  revokeAllSessions();
}
