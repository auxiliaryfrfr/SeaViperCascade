# SVC Contributing Guide

Thank you for considering contributing! We want to make contributing to this project as easy as possible.

## Local Development Setup

To get the local development environment running:

1. **Install dependencies:** `npm install`
2. **Start the dev servers:** `npm run dev`
   - Web UI: `http://localhost:5173`
   - API: `http://localhost:8787`
3. **Run desktop shell (Electron):** `npm run desktop:dev`

## Testing

Before submitting any code, ensure all integration and cryptographic tests pass.

- Run all tests: `npm run test`
- Integration tests are located at: `apps/server/tests/api.integration.test.ts`
- Crypto invariants tests are located at: `apps/server/tests/crypto.invariants.test.ts`

## Continuous Integration (CI) & Builds

All Pull Requests must pass the automated CI workflow (`.github/workflows/ci.yml`) which includes:
- `npm run lint`
- `npm run build`
- `npm run test`

If you are modifying the desktop wrapper, verify the build succeeds locally using `npm run desktop:build`. 

## Pull Request Process

1. Create a new branch for your feature or bugfix (e.g., `feat/ui-update` or `bug/login-fix`).
2. Write documented code and include tests if adding new cryptographic or API functionality.
3. Ensure your commits follow our [Commit Convention](.github/COMMIT_CONVENTION.md).
4. Open a Pull Request against the `main` branch.
5. Wait for the automated CI checks to pass and request a review.