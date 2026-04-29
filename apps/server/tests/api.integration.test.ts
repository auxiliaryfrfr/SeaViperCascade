import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "svc-api-test-"));

before(async () => {
  process.env.SVC_SERVER_ROOT = testRoot;
  process.env.SVC_DISABLE_AUTOSTART = "1";

  const serverModule = await import("../src/index");
  app = serverModule.app;
  await app.ready();
});

after(async () => {
  await app.close();
  fs.rmSync(testRoot, { recursive: true, force: true });
  delete process.env.SVC_SERVER_ROOT;
  delete process.env.SVC_DISABLE_AUTOSTART;
});

test("status endpoint reports uninitialized vault before bootstrap", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/status"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as { initialized: boolean; installId: string };
  assert.equal(body.initialized, false);
  assert.equal(typeof body.installId, "string");
  assert.ok(body.installId.length > 10);
});

test("bootstrap and unlock flow returns a valid session and default settings", async () => {
  const bootstrapResponse = await app.inject({
    method: "POST",
    url: "/api/bootstrap",
    payload: {
      masterPassword: "VeryStrongTestMaster123!"
    }
  });

  assert.equal(bootstrapResponse.statusCode, 200);
  const bootstrapBody = bootstrapResponse.json() as { recoveryCode: string };
  assert.equal(typeof bootstrapBody.recoveryCode, "string");
  assert.ok(bootstrapBody.recoveryCode.length >= 20);

  const unlockResponse = await app.inject({
    method: "POST",
    url: "/api/auth/unlock",
    payload: {
      masterPassword: "VeryStrongTestMaster123!"
    }
  });

  assert.equal(unlockResponse.statusCode, 200);
  const unlockBody = unlockResponse.json() as { token: string; recoveryUnlocked: boolean };
  assert.equal(unlockBody.recoveryUnlocked, false);
  assert.equal(typeof unlockBody.token, "string");
  assert.ok(unlockBody.token.length > 20);

  const settingsResponse = await app.inject({
    method: "GET",
    url: "/api/settings",
    headers: {
      Authorization: `Bearer ${unlockBody.token}`
    }
  });

  assert.equal(settingsResponse.statusCode, 200);
  const settingsBody = settingsResponse.json() as {
    themeMode: string;
    logoutAllDevicesDefault: boolean;
  };

  assert.equal(settingsBody.themeMode, "dark");
  assert.equal(settingsBody.logoutAllDevicesDefault, false);
});

test("mobile sessions cannot perform full-session mutations", async () => {
  const unlockResponse = await app.inject({
    method: "POST",
    url: "/api/auth/unlock",
    payload: {
      masterPassword: "VeryStrongTestMaster123!"
    }
  });

  assert.equal(unlockResponse.statusCode, 200);
  const unlockBody = unlockResponse.json() as { token: string };

  const mobileTokenResponse = await app.inject({
    method: "POST",
    url: "/api/mobile/token",
    headers: {
      Authorization: `Bearer ${unlockBody.token}`
    },
    payload: {}
  });

  assert.equal(mobileTokenResponse.statusCode, 200);
  const mobileTokenBody = mobileTokenResponse.json() as { token: string };

  const consumeResponse = await app.inject({
    method: "POST",
    url: "/api/mobile/consume",
    payload: {
      token: mobileTokenBody.token
    }
  });

  assert.equal(consumeResponse.statusCode, 200);
  const consumeBody = consumeResponse.json() as { token: string };

  const settingsResponse = await app.inject({
    method: "PUT",
    url: "/api/settings",
    headers: {
      Authorization: `Bearer ${consumeBody.token}`
    },
    payload: {
      rememberMeDefault: false
    }
  });

  assert.equal(settingsResponse.statusCode, 403);

  const accountsResponse = await app.inject({
    method: "GET",
    url: "/api/accounts",
    headers: {
      Authorization: `Bearer ${consumeBody.token}`
    }
  });

  assert.equal(accountsResponse.statusCode, 200);
});

test("recovery import requires full auth and explicit confirmation", async () => {
  const unlockResponse = await app.inject({
    method: "POST",
    url: "/api/auth/unlock",
    payload: {
      masterPassword: "VeryStrongTestMaster123!"
    }
  });

  assert.equal(unlockResponse.statusCode, 200);
  const unlockBody = unlockResponse.json() as { token: string };

  const kitResponse = await app.inject({
    method: "POST",
    url: "/api/recovery/kit",
    headers: {
      Authorization: `Bearer ${unlockBody.token}`
    },
    payload: {
      passphrase: "StrongKitPassphrase123!"
    }
  });

  assert.equal(kitResponse.statusCode, 200);
  const kitBody = kitResponse.json() as { armoredBlob: string };

  const unauthenticatedImport = await app.inject({
    method: "POST",
    url: "/api/recovery/import",
    payload: {
      armoredBlob: kitBody.armoredBlob,
      passphrase: "StrongKitPassphrase123!",
      confirmRestore: true
    }
  });

  assert.equal(unauthenticatedImport.statusCode, 401);

  const missingConfirmationImport = await app.inject({
    method: "POST",
    url: "/api/recovery/import",
    headers: {
      Authorization: `Bearer ${unlockBody.token}`
    },
    payload: {
      armoredBlob: kitBody.armoredBlob,
      passphrase: "StrongKitPassphrase123!"
    }
  });

  assert.equal(missingConfirmationImport.statusCode, 400);
});

test("unsafe local URLs are rejected for stored navigation targets", async () => {
  const unlockResponse = await app.inject({
    method: "POST",
    url: "/api/auth/unlock",
    payload: {
      masterPassword: "VeryStrongTestMaster123!"
    }
  });

  assert.equal(unlockResponse.statusCode, 200);
  const unlockBody = unlockResponse.json() as { token: string };

  const unsafePlatformResponse = await app.inject({
    method: "POST",
    url: "/api/platforms",
    headers: {
      Authorization: `Bearer ${unlockBody.token}`
    },
    payload: {
      name: "Local Admin",
      baseUrl: "http://127.0.0.1:3000",
      tag: "Unsafe",
      logoUrl: null,
      logoData: null
    }
  });

  assert.equal(unsafePlatformResponse.statusCode, 400);

  const platformsResponse = await app.inject({
    method: "GET",
    url: "/api/platforms",
    headers: {
      Authorization: `Bearer ${unlockBody.token}`
    }
  });

  assert.equal(platformsResponse.statusCode, 200);
  const platforms = platformsResponse.json() as Array<{ id: string }>;
  assert.ok(platforms[0]?.id);

  const unsafeAccountResponse = await app.inject({
    method: "POST",
    url: "/api/accounts",
    headers: {
      Authorization: `Bearer ${unlockBody.token}`
    },
    payload: {
      platformId: platforms[0].id,
      accountLabel: "Local Account",
      loginUrl: "http://192.168.1.1/login",
      username: "admin",
      password: "password",
      notes: "",
      tags: []
    }
  });

  assert.equal(unsafeAccountResponse.statusCode, 400);
});

test("successful recovery import revokes active sessions", async () => {
  const unlockResponse = await app.inject({
    method: "POST",
    url: "/api/auth/unlock",
    payload: {
      masterPassword: "VeryStrongTestMaster123!"
    }
  });

  assert.equal(unlockResponse.statusCode, 200);
  const unlockBody = unlockResponse.json() as { token: string };

  const kitResponse = await app.inject({
    method: "POST",
    url: "/api/recovery/kit",
    headers: {
      Authorization: `Bearer ${unlockBody.token}`
    },
    payload: {
      passphrase: "StrongKitPassphrase123!"
    }
  });

  assert.equal(kitResponse.statusCode, 200);
  const kitBody = kitResponse.json() as { armoredBlob: string };

  const importResponse = await app.inject({
    method: "POST",
    url: "/api/recovery/import",
    headers: {
      Authorization: `Bearer ${unlockBody.token}`
    },
    payload: {
      armoredBlob: kitBody.armoredBlob,
      passphrase: "StrongKitPassphrase123!",
      confirmRestore: true
    }
  });

  assert.equal(importResponse.statusCode, 200);

  const revokedSessionResponse = await app.inject({
    method: "GET",
    url: "/api/settings",
    headers: {
      Authorization: `Bearer ${unlockBody.token}`
    }
  });

  assert.equal(revokedSessionResponse.statusCode, 401);
});
