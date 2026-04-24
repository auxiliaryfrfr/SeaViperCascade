const path = require("node:path");
const { spawn } = require("node:child_process");
const { app, BrowserWindow } = require("electron");
const waitOn = require("wait-on");

const SERVER_URL = "http://localhost:8787";
let serverProcess = null;
let mainWindow = null;

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

function startServer() {
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
      console.error(`SeaViperCascade server exited with code ${code}`);
    }
  });
}

async function boot() {
  startServer();

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
});

app.whenReady().then(() => {
  void boot().catch((error) => {
    console.error("Failed to boot desktop app:", error);
    app.quit();
  });
});
