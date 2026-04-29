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

## Notes
- This project is entirely local and no cloud dependency is required.
- The recovery code should be stored offline.
- If you lose both master password and recovery code, vault decryption is not possible by design.
- Desktop release can run unsigned by default; add signing secrets when you are ready to distribute trusted signed artifacts.
- This project is not yet released and is not deemed ready for general use, as most of it's features are not yet working.
- The project is publicly available strictly for developers who want to use this code or help with the project.

> **Contributing:** Please read the [Contributing Guide](CONTRIBUTING.md) and our [Commit Convention](.github/COMMIT_CONVENTION.md) before opening a Pull Request.
