# Sea Viper Cascade

A local password manager and password-changer automation tool.

## Specifics

- Local encrypted vault SQLite database with AES-256-GCM encryption.
- Zero-knowledge authentication model.
- Memory-only active encryption key handling with session revoke lock behavior.
- Canary-based unlock validation.
- Recovery-mode unlock path with a generated offline recovery code.
- Highly customizable themes and multi-app management.
- Account CRUD with encrypted fields.
- Password generator with configurable policy defaults.
- Playwright automation engine with queue-based runs, manual fallback for CAPTCHA/2FA, and optional password rotation.
- Browser credential CSV import with platform auto-mapping.
- Mobile network sync with single-use QR/session token URLs.
- Emergency Recovery Kit export and restore import.

## Architecture

Monorepo layout:

```text
apps/
	server/   Fastify + SQLite + Crypto + Playwright + PDFKit
	web/      React + Vite dashboard and mobile view
	desktop/  Electron wrapper for local packaged runtime
```

### Backend Stack

- Fastify API server
- better-sqlite3 local DB
- Node crypto (scrypt KDF + AES-256-GCM)
- Playwright automation runtime
- PDFKit for recovery kit generation

### Frontend Stack

- React + TypeScript + Vite
- Themed split-pane dashboard
- QRCode rendering for mobile sync
- Fontsource typography bundle for a distinctive visual style

### Desktop Stack

- Electron shell for bundled local desktop runtime
- electron-builder packaging (NSIS installer target on Windows)

## Security Model

1. Master password is never stored.
2. Master password is transformed with scrypt into a 256-bit key.
3. Database stores:
	 - Encrypted canary string (`auth_success`) for unlock validation.
	 - Wrapped Data Encryption Key (DEK) encrypted by master-derived key.
	 - Wrapped DEK encrypted by recovery-derived key.
4. Username/password/notes are encrypted using DEK (AES-256-GCM).
5. Active DEK is held only in RAM for active sessions.
6. Lock/revoke wipes session key material from memory.

## Automation Engine Behavior

- Supports selected accounts or full-vault runs.
- Opens a real browser session (prefers Edge on Windows, then Chrome, then bundled Chromium).
- Attempts login field fill and button flows.
- Applies preferences as per user settings.
- Supports optional password rotation with secure generation.
- If CAPTCHA/2FA/manual flow is detected, account is marked `manual_required`, and the page remains open for user completion.
- Includes profile packs for common providers (Google, Microsoft, Meta) with platform-specific selector hints and safe generic fallbacks.

## Mobile Sync

- Desktop generates a one-time mobile token.
- QR URL includes this single-use token.
- Phone on same local network opens `/mobile?t=<token>`.
- Token is consumed once and expires quickly.
- Mobile view includes clipboard copy buttons with fallback logic for strict mobile clipboard policies.

## Browser CSV Import

- Export passwords to CSV from your browser password manager.
- Import the CSV in the Vault tab using Browser Password Import.
- Imported entries are encrypted immediately before persistence in the local vault.
- Skipped rows and auto-created platform mappings are reported in the UI.

## Recovery Kit

- Recovery kit export creates an encrypted vault snapshot blob.
- Blob is embedded inside a downloadable/printable PDF.
- Import flow can restore vault metadata/platforms/accounts from that blob.

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

## Important Operational Notes

- This project is entirely local and no cloud dependency is required.
- The recovery code shown at first vault bootstrap should be stored offline.
- If you lose both master password and recovery code, vault decryption is not possible by design.
- Automation selectors vary by platform over time; manual fallback is expected for heavily protected or changed flows.

## Notes

- Browser password managers do not expose direct local vault APIs to third-party apps, so CSV export/import is the supported interoperability path.
- Desktop release can run unsigned by default; add signing secrets when you are ready to distribute trusted signed artifacts.
- This project is not yet released and is not deemed ready for general use, as most of its' functionalities and features are not yet implemented correctly.
- The project is publicly available strictly for developers who want to use this code or help with the project.

> **Contributing:** Please read the [Contributing Guide](CONTRIBUTING.md) and our [Commit Convention](.github/COMMIT_CONVENTION.md) before opening a Pull Request.