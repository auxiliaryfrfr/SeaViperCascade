import fs from "node:fs";
import path from "node:path";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import {
  CSV_TEXT_MAX_BYTES,
  HOST,
  LOGO_DATA_MAX_BYTES,
  PORT,
  RECOVERY_BLOB_MAX_BYTES,
  THEME_VALUE_MAX_LENGTH,
  TRUSTED_ORIGINS,
  WEB_DEV_ORIGIN
} from "./config";
import { generateSecurePassword, normalizePasswordDefaults } from "./lib/password";
import { normalizePublicWebUrl } from "./lib/urlSafety";
import { getLanAddresses } from "./lib/network";
import { getSession, revokeAllSessions, revokeSession } from "./services/sessionStore";
import {
  bootstrapVault,
  getVaultState,
  resetMasterFromRecovery,
  unlockWithMaster,
  unlockWithRecoveryCode
} from "./services/authService";
import { createMobileShareToken, consumeMobileShareToken } from "./services/mobileShareService";
import { createPlatform, ensureSeedPlatforms, listPlatforms, removePlatform, updatePlatform } from "./services/platformService";
import {
  createVaultAccount,
  getVaultAccount,
  importVaultAccountsFromBrowserCsv,
  listVaultAccounts,
  removeVaultAccount,
  updateVaultAccount
} from "./services/accountService";
import { readSettings, updateSettings } from "./services/settingsService";
import { getAutomationJob, startAutomationJob } from "./services/automationService";
import { createRecoveryText, generateRecoveryKit, restoreFromRecoveryBlob } from "./services/recoveryService";
import { closeDatabase, getInstallId, isVaultInitialized } from "./services/database";
import type { SessionContext } from "./types";

class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function parseAuthorization(header: string | undefined): string | null {
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length).trim();
}

function requireSession(request: FastifyRequest): SessionContext {
  const token = parseAuthorization(request.headers.authorization);
  if (!token) {
    throw new ApiError(401, "Missing authorization token.");
  }

  const session = getSession(token);
  if (!session) {
    throw new ApiError(401, "Session is invalid or expired.");
  }

  return session;
}

function requireFullSession(request: FastifyRequest): SessionContext {
  const session = requireSession(request);
  if (session.mobile) {
    throw new ApiError(403, "This operation requires a full desktop session.");
  }

  return session;
}

function trustedOrigins(): Set<string> {
  return new Set([
    WEB_DEV_ORIGIN,
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    ...TRUSTED_ORIGINS
  ]);
}

const idSchema = z.string().min(1).max(80);
const safeWebUrlSchema = (fieldName: string) =>
  z
    .string()
    .min(8)
    .max(2048)
    .transform((url, context) => {
      try {
        return normalizePublicWebUrl(url, { fieldName, allowHttp: false });
      } catch (error) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: error instanceof Error ? error.message : `${fieldName} is not allowed.`
        });
        return z.NEVER;
      }
    });
const optionalLogoUrlSchema = z
  .string()
  .min(8)
  .max(2048)
  .transform((url, context) => {
    try {
      return normalizePublicWebUrl(url, { fieldName: "Logo URL", allowHttp: false });
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "Logo URL is not allowed."
      });
      return z.NEVER;
    }
  })
  .nullable()
  .optional();
const logoDataSchema = z
  .string()
  .max(LOGO_DATA_MAX_BYTES)
  .refine((value) => value.startsWith("data:image/"), "Logo upload must be an image data URL.")
  .nullable()
  .optional();
const themeValueSchema = z
  .string()
  .min(1)
  .max(THEME_VALUE_MAX_LENGTH)
  .refine((value) => !/(url\s*\(|@import|expression\s*\(|;)/i.test(value), "Theme value is not allowed.");

const app = Fastify({ logger: false, bodyLimit: RECOVERY_BLOB_MAX_BYTES + 1024 });

app.addHook("onClose", async () => {
  closeDatabase();
});

app.register(cors, {
  origin: (origin, callback) => {
    if (!origin || trustedOrigins().has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin is not allowed by CORS."), false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
});

app.register(rateLimit, {
  max: 120,
  timeWindow: "1 minute"
});

app.addHook("onSend", async (_request, reply, payload) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  reply.header(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' http://localhost:* http://127.0.0.1:*",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'"
    ].join("; ")
  );

  return payload;
});

const webDistPath = path.resolve(__dirname, "../../web/dist");
const webBuilt = fs.existsSync(webDistPath);

if (webBuilt) {
  app.register(fastifyStatic, {
    root: webDistPath,
    prefix: "/"
  });
}

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ApiError) {
    reply.code(error.statusCode).send({ error: error.message });
    return;
  }

  if (error instanceof z.ZodError) {
    reply.code(400).send({ error: error.issues.map((issue) => issue.message).join("; ") });
    return;
  }

  console.error("Unhandled API error:", error);
  reply.code(500).send({ error: "Internal server error" });
});

app.get("/api/status", async () => {
  const vaultState = getVaultState();
  return {
    initialized: vaultState.initialized,
    installId: getInstallId(),
    lanAddresses: getLanAddresses(),
    webOrigin: WEB_DEV_ORIGIN
  };
});

app.post("/api/bootstrap", async (request) => {
  const body = z
    .object({
      masterPassword: z.string().min(12)
    })
    .parse(request.body);

  const result = await bootstrapVault(body.masterPassword);
  return result;
});

app.post("/api/auth/unlock", async (request) => {
  const body = z
    .object({
      masterPassword: z.string().min(8)
    })
    .parse(request.body);

  return await unlockWithMaster(body.masterPassword);
});

app.post("/api/auth/unlock-recovery", async (request) => {
  const body = z
    .object({
      recoveryCode: z.string().min(8)
    })
    .parse(request.body);

  return await unlockWithRecoveryCode(body.recoveryCode);
});

app.post("/api/auth/reset-master", async (request) => {
  const session = requireSession(request);
  if (!session.recoveryUnlocked) {
    throw new ApiError(403, "This session was not unlocked with recovery mode.");
  }

  const token = parseAuthorization(request.headers.authorization);
  if (!token) {
    throw new ApiError(401, "Missing authorization token.");
  }

  const body = z
    .object({
      newMasterPassword: z.string().min(12)
    })
    .parse(request.body);

  await resetMasterFromRecovery(token, body.newMasterPassword, session.dek);
  return { success: true };
});

app.post("/api/auth/lock", async (request) => {
  const token = parseAuthorization(request.headers.authorization);
  if (!token) {
    throw new ApiError(401, "Missing authorization token.");
  }

  revokeSession(token);
  return { success: true };
});

app.get("/api/settings", async (request) => {
  requireFullSession(request);
  return readSettings();
});

app.put("/api/settings", async (request) => {
  requireFullSession(request);
  const body = z
    .object({
      themeMode: z.enum(["dark", "light", "green", "yellow", "pink", "custom"]).optional(),
      customTheme: z
        .object({
          background: themeValueSchema,
          backgroundElevated: themeValueSchema,
          surface: themeValueSchema,
          border: themeValueSchema,
          textPrimary: themeValueSchema,
          textMuted: themeValueSchema,
          accent: themeValueSchema,
          accentAlt: themeValueSchema
        })
        .nullable()
        .optional(),
      logoutAllDevicesDefault: z.boolean().optional(),
      rememberMeDefault: z.boolean().optional(),
      passwordDefaults: z
        .object({
          length: z.number().int().min(8).max(128).optional(),
          includeUppercase: z.boolean().optional(),
          includeLowercase: z.boolean().optional(),
          includeNumbers: z.boolean().optional(),
          includeSymbols: z.boolean().optional()
        })
        .optional()
    })
    .parse(request.body);

  return updateSettings(body);
});

app.post("/api/password/generate", async (request) => {
  requireFullSession(request);
  const body = z
    .object({
      length: z.number().int().min(8).max(128).optional(),
      includeUppercase: z.boolean().optional(),
      includeLowercase: z.boolean().optional(),
      includeNumbers: z.boolean().optional(),
      includeSymbols: z.boolean().optional()
    })
    .parse(request.body);

  return {
    password: generateSecurePassword(normalizePasswordDefaults(body))
  };
});

app.get("/api/platforms", async (request) => {
  requireFullSession(request);
  return listPlatforms();
});

app.post("/api/platforms", async (request) => {
  requireFullSession(request);
  const body = z
    .object({
      name: z.string().min(2),
      baseUrl: safeWebUrlSchema("Platform URL"),
      tag: z.string().min(2),
      logoUrl: optionalLogoUrlSchema,
      logoData: logoDataSchema
    })
    .parse(request.body);

  return createPlatform(body);
});

app.put("/api/platforms/:id", async (request) => {
  requireFullSession(request);
  const params = z.object({ id: idSchema }).parse(request.params);
  const body = z
    .object({
      name: z.string().min(2),
      baseUrl: safeWebUrlSchema("Platform URL"),
      tag: z.string().min(2),
      logoUrl: optionalLogoUrlSchema,
      logoData: logoDataSchema
    })
    .parse(request.body);

  return updatePlatform(params.id, body);
});

app.delete("/api/platforms/:id", async (request) => {
  requireFullSession(request);
  const params = z.object({ id: idSchema }).parse(request.params);
  removePlatform(params.id);
  return { success: true };
});

app.get("/api/accounts", async (request) => {
  const session = requireSession(request);
  return listVaultAccounts(session);
});

app.post("/api/accounts", async (request) => {
  const session = requireFullSession(request);
  const body = z
    .object({
      platformId: z.string().min(1),
      accountLabel: z.string().min(1).max(200),
      loginUrl: safeWebUrlSchema("Login URL"),
      username: z.string().min(1).max(1024),
      password: z.string().min(1).max(4096),
      notes: z.string().max(10000).optional(),
      tags: z.array(z.string().min(1).max(80)).max(50).optional(),
      passwordPolicy: z
        .object({
          length: z.number().int().min(8).max(128).optional(),
          includeUppercase: z.boolean().optional(),
          includeLowercase: z.boolean().optional(),
          includeNumbers: z.boolean().optional(),
          includeSymbols: z.boolean().optional()
        })
        .optional()
    })
    .parse(request.body);

  return createVaultAccount(session, body);
});

app.post("/api/accounts/import-csv", async (request) => {
  const session = requireFullSession(request);

  const body = z
    .object({
      csvText: z.string().min(10)
        .max(CSV_TEXT_MAX_BYTES)
    })
    .parse(request.body);

  return importVaultAccountsFromBrowserCsv(session, body.csvText);
});

app.put("/api/accounts/:id", async (request) => {
  const session = requireFullSession(request);
  const params = z.object({ id: idSchema }).parse(request.params);
  const body = z
    .object({
      platformId: z.string().min(1),
      accountLabel: z.string().min(1).max(200),
      loginUrl: safeWebUrlSchema("Login URL"),
      username: z.string().min(1).max(1024),
      password: z.string().min(1).max(4096),
      notes: z.string().max(10000).optional(),
      tags: z.array(z.string().min(1).max(80)).max(50).optional(),
      passwordPolicy: z
        .object({
          length: z.number().int().min(8).max(128).optional(),
          includeUppercase: z.boolean().optional(),
          includeLowercase: z.boolean().optional(),
          includeNumbers: z.boolean().optional(),
          includeSymbols: z.boolean().optional()
        })
        .optional()
    })
    .parse(request.body);

  return updateVaultAccount(session, params.id, body);
});

app.delete("/api/accounts/:id", async (request) => {
  requireFullSession(request);
  const params = z.object({ id: idSchema }).parse(request.params);
  removeVaultAccount(params.id);
  return { success: true };
});

app.post("/api/automation/jobs", async (request) => {
  const session = requireFullSession(request);
  const body = z
    .object({
      accountIds: z.array(z.string()).optional(),
      rotatePasswords: z.boolean(),
      logoutAllDevices: z.boolean().optional(),
      rememberMe: z.boolean().optional(),
      passwordDefaults: z
        .object({
          length: z.number().int().min(8).max(128).optional(),
          includeUppercase: z.boolean().optional(),
          includeLowercase: z.boolean().optional(),
          includeNumbers: z.boolean().optional(),
          includeSymbols: z.boolean().optional()
        })
        .optional()
    })
    .parse(request.body);

  return startAutomationJob(session, body);
});

app.get("/api/automation/jobs/:id", async (request) => {
  const session = requireFullSession(request);
  const params = z.object({ id: idSchema }).parse(request.params);
  return getAutomationJob(session, params.id);
});

app.post("/api/mobile/token", async (request) => {
  const session = requireFullSession(request);
  const body = z
    .object({
      frontendPort: z.number().int().min(1).max(65535).optional()
    })
    .parse(request.body);

  const token = createMobileShareToken(session.token);
  const addresses = getLanAddresses();
  const selectedHost = addresses[0] ?? "localhost";
  const mobilePort = webBuilt ? PORT : body.frontendPort ?? 5173;

  const mobileUrl = `http://${selectedHost}:${mobilePort}/mobile?t=${encodeURIComponent(token)}`;

  return {
    token,
    mobileUrl,
    candidateUrls: addresses.map(
      (address) => `http://${address}:${mobilePort}/mobile?t=${encodeURIComponent(token)}`
    ),
    expiresInSeconds: 300
  };
});

app.post("/api/mobile/consume", async (request) => {
  const body = z
    .object({
      token: z.string().min(8)
    })
    .parse(request.body);

  const mobileSessionToken = consumeMobileShareToken(body.token);
  return {
    token: mobileSessionToken
  };
});

app.post("/api/recovery/kit", async (request) => {
  requireFullSession(request);

  const body = z
    .object({
      passphrase: z.string().min(12)
    })
    .parse(request.body);

  const kit = await generateRecoveryKit(body.passphrase);

  return {
    fileName: kit.fileName,
    filePath: kit.filePath,
    armoredBlob: createRecoveryText(kit.blob),
    pdfBase64: kit.pdfBase64
  };
});

app.post("/api/recovery/import", async (request) => {
  requireFullSession(request);
  const body = z
    .object({
      armoredBlob: z.string().min(100).max(RECOVERY_BLOB_MAX_BYTES),
      passphrase: z.string().min(12),
      confirmRestore: z.literal(true)
    })
    .parse(request.body);

  await restoreFromRecoveryBlob(body.armoredBlob, body.passphrase);
  ensureSeedPlatforms();
  revokeAllSessions();

  return {
    success: true,
    initialized: isVaultInitialized()
  };
});

if (webBuilt) {
  app.setNotFoundHandler(async (request, reply: FastifyReply) => {
    if (request.url.startsWith("/api/")) {
      reply.code(404).send({ error: "Not found" });
      return;
    }

    return reply.sendFile("index.html");
  });
}

let listenPromise: Promise<string> | null = null;

export async function startServer(): Promise<string> {
  if (listenPromise) {
    return listenPromise;
  }

  listenPromise = app
    .listen({ host: HOST, port: PORT })
    .then((address) => {
      console.log(`SVC backend running on ${address}`);
      return address;
    })
    .catch((error) => {
      listenPromise = null;
      throw error;
    });

  return listenPromise;
}

if (process.env.SVC_DISABLE_AUTOSTART !== "1") {
  void startServer().catch((error) => {
    console.error("Failed to start SVC backend:", error);
    process.exit(1);
  });
}

export { app };
