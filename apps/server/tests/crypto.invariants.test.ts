import assert from "node:assert/strict";
import { test } from "node:test";
import { createSalt, decryptText, deriveKey, encryptText, wipeBuffer } from "../src/lib/crypto";

test("AES-GCM helpers roundtrip plaintext with derived keys", async () => {
  const salt = createSalt();
  const key = await deriveKey("SVC-Strong-Test-Password!", salt);

  try {
    const plaintext = "local-only-secrets";
    const cipherText = encryptText(plaintext, key);
    const decrypted = decryptText(cipherText, key);

    assert.equal(decrypted, plaintext);
    assert.notEqual(cipherText.includes(plaintext), true);
  } finally {
    wipeBuffer(key);
  }
});

test("KDF output differs for different salts", async () => {
  const keyA = await deriveKey("SVC-Strong-Test-Password!", createSalt());
  const keyB = await deriveKey("SVC-Strong-Test-Password!", createSalt());

  try {
    assert.equal(Buffer.compare(keyA, keyB) === 0, false);
  } finally {
    wipeBuffer(keyA);
    wipeBuffer(keyB);
  }
});

test("wipeBuffer zeroes key material", async () => {
  const key = await deriveKey("SVC-Strong-Test-Password!", createSalt());
  wipeBuffer(key);
  assert.ok(key.every((value) => value === 0));
});
