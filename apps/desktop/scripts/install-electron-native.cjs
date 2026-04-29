const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const MODULE_NAME = "better-sqlite3";
const NATIVE_BINARY = "build/Release/better_sqlite3.node";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getElectronVersion() {
  const packageJson = readJson(path.join(__dirname, "..", "package.json"));
  const declaredVersion =
    packageJson.devDependencies?.electron ?? packageJson.dependencies?.electron;

  if (!declaredVersion) {
    throw new Error("Electron version is not declared in apps/desktop/package.json.");
  }

  return declaredVersion.replace(/^[^\d]*/, "");
}

function getArch(context) {
  if (typeof context.arch === "string") {
    return context.arch;
  }

  const electronBuilderArch = new Map([
    [0, "ia32"],
    [1, "x64"],
    [2, "armv7l"],
    [3, "arm64"],
    [4, "universal"]
  ]);

  return electronBuilderArch.get(context.arch) ?? process.arch;
}

function getResourcesDir(context) {
  if (context.electronPlatformName === "darwin") {
    const appName = `${context.packager.appInfo.productFilename}.app`;
    return path.join(context.appOutDir, appName, "Contents", "Resources");
  }

  return path.join(context.appOutDir, "resources");
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
    env: {
      ...process.env,
      ...options.env
    }
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
  }
}

function runNodeScript(scriptPath, args, options) {
  run(process.execPath, [scriptPath, ...args], options);
}

function findTool(packageName, binPath) {
  return require.resolve(path.join(packageName, binPath), {
    paths: [__dirname, process.cwd()]
  });
}

function copyForSourceRebuild(sourceDir, targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}build${path.sep}`)
  });
}

function rebuildFromSource({ sourceModuleDir, nativeModuleDir, electronVersion, arch }) {
  const tempModuleDir = path.join(
    nativeModuleDir,
    "..",
    "..",
    ".native-rebuild",
    MODULE_NAME
  );
  const nodeGypBin = findTool("node-gyp", "bin/node-gyp.js");

  copyForSourceRebuild(sourceModuleDir, tempModuleDir);

  runNodeScript(
    nodeGypBin,
    [
      "rebuild",
      "--release",
      `--target=${electronVersion}`,
      "--runtime=electron",
      "--dist-url=https://electronjs.org/headers",
      `--arch=${arch}`
    ],
    { cwd: tempModuleDir, env: {} }
  );

  const rebuiltBinary = path.join(tempModuleDir, NATIVE_BINARY);
  const packagedBinary = path.join(nativeModuleDir, NATIVE_BINARY);
  fs.mkdirSync(path.dirname(packagedBinary), { recursive: true });
  fs.copyFileSync(rebuiltBinary, packagedBinary);
}

module.exports = async function installElectronNative(context) {
  const electronVersion = getElectronVersion();
  const arch = getArch(context);
  const resourcesDir = getResourcesDir(context);
  const nativeModuleDir = path.join(
    resourcesDir,
    "app.asar.unpacked",
    "node_modules",
    MODULE_NAME
  );

  if (!fs.existsSync(nativeModuleDir)) {
    throw new Error(`Packaged ${MODULE_NAME} module was not found at ${nativeModuleDir}.`);
  }

  const prebuildInstallBin = findTool("prebuild-install", "bin.js");

  try {
    runNodeScript(
      prebuildInstallBin,
      ["--runtime", "electron", "--target", electronVersion, "--arch", arch],
      { cwd: nativeModuleDir, env: {} }
    );
  } catch (error) {
    console.warn(
      `Electron prebuild install for ${MODULE_NAME} failed; rebuilding from source instead.`
    );

    const sourceModuleDir = path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "node_modules",
      MODULE_NAME
    );

    if (!fs.existsSync(path.join(sourceModuleDir, "binding.gyp"))) {
      throw error;
    }

    rebuildFromSource({ sourceModuleDir, nativeModuleDir, electronVersion, arch });
  }

  const packagedBinary = path.join(nativeModuleDir, NATIVE_BINARY);
  if (!fs.existsSync(packagedBinary)) {
    throw new Error(`Electron native binary was not created at ${packagedBinary}.`);
  }
};
