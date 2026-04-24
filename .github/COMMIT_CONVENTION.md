# Git Commit Message Convention

To keep the repository history clean, readable, and easy to trace, we're going to use a structured commit convention. This helps everyone (including our CI/CD pipelines and automated changelogs) understand exactly what a commit does without having to read the code.

This convention is adapted from the Angular standard.

## TL;DR:

Your commit messages must match this format:
`<type>(<scope>): <subject>`

**Example:** `feat(vault): add browser CSV import engine`

---

## The Header

The header is the first line of your commit and is mandatory. It consists of three parts:

### 1. Type
The type dictates what kind of change you are making. If the type is `feat`, `fix`, or `perf`, it will generally appear in automated changelogs.

* **`feat`**: A new feature (e.g., adding a new UI theme).
* **`fix`**: A bug fix (e.g., fixing a SQLite database lock).
* **`style`**: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, CSS color tweaks).
* **`refactor`**: A code change that neither fixes a bug nor adds a feature (e.g., restructuring the API routes).
* **`perf`**: A code change that improves performance (e.g., optimizing Framer Motion animations).
* **`test`**: Adding missing tests or correcting existing tests.
* **`chore`**: Maintenance tasks, updating dependencies, or modifying build configs (Electron/Vite).
* **`docs`**: Documentation only changes.
* **`ci`**: Changes to our CI configuration files and scripts (e.g., GitHub Actions).

### 2. Scope (Optional but recommended)
The scope tells us exactly what part of the app you touched. Common scopes for this project include:
* `ui` (React components, dashboard)
* `vault` (SQLite, encryption, key derivation)
* `bot` (Playwright automation engine)
* `electron` (Desktop packaging, main process)
* `mobile` (QR sync, mobile view)

### 3. Subject
The subject contains a concise description of the change. 
* Use the imperative, present tense: "add" not "added" or "adds" (e.g., "add buttons").
* Do not capitalize the first letter.
* Do not put a period (`.`) at the end.

---

## The Body (Optional)
Just like the subject, use the imperative, present tense. The body should include the motivation for the change and contrast this with previous behavior. Leave one blank line between the Header and the Body.

---

## The Footer (Optional)
The footer is the place to reference GitHub issues that this commit closes, or to declare Breaking Changes.

**Breaking Changes** should start with the phrase `BREAKING CHANGE:` followed by a space or two newlines. The rest of the commit message is then used to explain the breaking change.

---

## Examples

**Adding a new feature:**
```text
feat(ui): add better looking launch button

Replaces the old launch button with a Framer Motion animated button to improve the feel of the dashboard.
```

**Fixing a bug:**
```text
fix(vault): resolve sqlite file locking on shutdown

closes #12
```

**A performance tweak with a breaking change:**
```text
perf(bot): optimize playwright launch sequence

BREAKING CHANGE: The 'slow_mo' option has been removed from the default automation profile to speed up execution.
```