import crypto from "node:crypto";
import type { PasswordDefaults } from "../types";

const CHARSETS = {
  uppercase: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  lowercase: "abcdefghijkmnopqrstuvwxyz",
  numbers: "23456789",
  symbols: "!@#$%^&*()-_=+[]{}:,.?/"
};

function pickRandom(source: string): string {
  if (!source.length) {
    throw new Error("Cannot pick random character from an empty source.");
  }

  const index = crypto.randomInt(0, source.length);
  return source[index];
}

function shuffle(values: string[]): string[] {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const randomIndex = crypto.randomInt(0, i + 1);
    [values[i], values[randomIndex]] = [values[randomIndex], values[i]];
  }

  return values;
}

export function normalizePasswordDefaults(input?: Partial<PasswordDefaults>): PasswordDefaults {
  return {
    length: Math.max(8, Math.min(128, input?.length ?? 16)),
    includeUppercase: input?.includeUppercase ?? true,
    includeLowercase: input?.includeLowercase ?? true,
    includeNumbers: input?.includeNumbers ?? true,
    includeSymbols: input?.includeSymbols ?? true
  };
}

export function generateSecurePassword(input?: Partial<PasswordDefaults>): string {
  const options = normalizePasswordDefaults(input);
  const selectedSets: string[] = [];

  if (options.includeUppercase) {
    selectedSets.push(CHARSETS.uppercase);
  }
  if (options.includeLowercase) {
    selectedSets.push(CHARSETS.lowercase);
  }
  if (options.includeNumbers) {
    selectedSets.push(CHARSETS.numbers);
  }
  if (options.includeSymbols) {
    selectedSets.push(CHARSETS.symbols);
  }

  if (!selectedSets.length) {
    throw new Error("At least one character set must be enabled.");
  }

  const requiredChars = selectedSets.map((set) => pickRandom(set));
  const allChars = selectedSets.join("");
  const result = [...requiredChars];

  while (result.length < options.length) {
    result.push(pickRandom(allChars));
  }

  return shuffle(result).join("");
}
