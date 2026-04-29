# Sea Viper Cascade

A local password manager and password-changer automation tool.

For more information check the [wiki](https://github.com/auxiliaryfrfr/SeaViperCascade/wiki).

## Warning

SVC is currently in active beta development and is NOT recommended for general or production use.

Core features, security, and functionality are still being actively tested and refined.  
This repository is publicly available primarily for development, contributor collaboration, and code transparency.

Do not rely on this application for critical credential storage until a stable public release is announced.

Use at your own risk.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Run in development

```bash
npm run dev
```

- Web UI: `http://localhost:5173`
- API: `http://localhost:8787`

### 3. Build for production

```bash
npm run build
```

### 4. Run backend with built frontend served statically

```bash
npm run start
```

- Production app URL: `http://localhost:8787`

### 5. Run desktop shell (Electron)

```bash
npm run desktop:dev
```

The desktop shell starts the local server and opens the app in a desktop window.

### 6. Build desktop artifacts

```bash
npm run desktop:build
```

For an installer package:

```bash
npm run desktop:dist
```

> **Contributing:** Please read the [Contributing Guide](CONTRIBUTING.md) and our [Commit Convention](.github/COMMIT_CONVENTION.md) before opening a Pull Request.
