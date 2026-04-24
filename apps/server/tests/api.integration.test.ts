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
