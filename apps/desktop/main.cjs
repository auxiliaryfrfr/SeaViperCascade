const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawn } = require("node:child_process");
const { app, BrowserWindow } = require("electron");
const waitOn = require("wait-on");

const SERVER_URL = "http://localhost:8787";
let serverProcess = null;
let serverApp = null;
let mainWindow = null;

function writeLog(message, error) {
  try {
    const logDir = app.getPath("logs");
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, "svc-desktop.log");
    const details = error ? ` ${error.stack ?? error}` : "";
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}${details}\n`);
  } catch {
    // Avoid crashing if the log path is unavailable.
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    title: "SeaViperCascade",
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  void mainWindow.loadURL(SERVER_URL);
}

function startDevServer() {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const isWindows = process.platform === "win32";
  const npmCommand = isWindows ? "npm.cmd" : "npm";

  serverProcess = spawn(npmCommand, ["run", "start", "--workspace", "@svc/server"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      SVC_DISABLE_AUTOSTART: "0"
    },
    stdio: "inherit"
  });

  serverProcess.on("exit", (code) => {
    if (!app.isQuitting) {
      app.quit();
    }

    if (code && code !== 0) {
      writeLog(`SeaViperCascade server exited with code ${code}`);
      console.error(`SeaViperCascade server exited with code ${code}`);
    }
  });
}

async function startBundledServer() {
  process.env.SVC_DISABLE_AUTOSTART = "1";
  process.env.SVC_SERVER_ROOT = path.join(app.getPath("userData"), "svc");

  const serverEntry = require.resolve("@svc/server/dist/index.js");
  const serverModule = await import(pathToFileURL(serverEntry).href);
  const startServer = serverModule.startServer ?? serverModule.default?.startServer;

  serverApp = serverModule.app ?? serverModule.default?.app ?? null;

  if (!startServer) {
    throw new Error("Bundled server entry is missing startServer export.");
  }

  await startServer();
}

async function boot() {
  if (app.isPackaged) {
    await startBundledServer();
  } else {
    startDevServer();
  }

  await waitOn({
    resources: [SERVER_URL],
    timeout: 45000,
    validateStatus: (status) => status >= 200 && status < 500
  });

  createWindow();
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  app.isQuitting = true;
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }

  if (serverApp) {
    void serverApp.close();
    serverApp = null;
  }
});

app.whenReady().then(() => {
  void boot().catch((error) => {
    writeLog("Failed to boot desktop app.", error);
    console.error("Failed to boot desktop app:", error);
    app.quit();
  });
});
