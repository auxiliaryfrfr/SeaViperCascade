import { useEffect, useMemo, useState, type JSX } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertTriangle,
  Brush,
  Clipboard,
  Download,
  Flame,
  KeyRound,
  Laptop,
  Lock,
  RefreshCw,
  Rocket,
  Server,
  Shield,
  Smartphone,
  Upload,
  UserRound,
  Vault
} from "lucide-react";
import {
  bootstrapVault,
  consumeMobileToken,
  createAccount,
  createMobileToken,
  createPlatform,
  createRecoveryKit,
  deleteAccount,
  deletePlatform,
  generatePassword,
  getAutomationJob,
  getSettings,
  getStatus,
  importBrowserCsv,
  importRecoveryKit,
  listAccounts,
  listPlatforms,
  lockVault,
  resetMasterPassword,
  startAutomation,
  unlockVault,
  unlockVaultWithRecovery,
  updateAccount,
  updateSettings
} from "./api";
import { applyThemeToDocument, resolveTheme, THEME_PRESETS } from "./theme";
import type {
  Account,
  AppSettings,
  AutomationJob,
  BrowserCsvImportResult,
  PasswordDefaults,
  Platform,
  StatusResponse,
  ThemeMode,
  ThemeVariables
} from "./types";
import { robustCopyToClipboard } from "./utils";

type StageTab = "vault" | "automation" | "platforms" | "themes" | "mobile" | "recovery";

interface AccountDraft {
  id: string | null;
  platformId: string;
  accountLabel: string;
  loginUrl: string;
  username: string;
  password: string;
  notes: string;
  tagsCsv: string;
  passwordPolicy: PasswordDefaults;
}

const defaultPolicy: PasswordDefaults = {
  length: 16,
  includeUppercase: true,
  includeLowercase: true,
  includeNumbers: true,
  includeSymbols: true
};

function emptyDraft(platformId = ""): AccountDraft {
  return {
    id: null,
    platformId,
    accountLabel: "",
    loginUrl: "https://",
    username: "",
    password: "",
    notes: "",
    tagsCsv: "",
    passwordPolicy: defaultPolicy
  };
}

function displayInitials(name: string): string {
  const compact = name.trim();
  if (!compact) {
    return "SV";
  }

  const split = compact.split(/\s+/).filter(Boolean);
  if (split.length === 1) {
    return split[0].slice(0, 2).toUpperCase();
  }

  return `${split[0][0]}${split[1][0]}`.toUpperCase();
}

function capitalizeMode(mode: ThemeMode): string {
  return mode.slice(0, 1).toUpperCase() + mode.slice(1);
}

interface LeverSwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  compact?: boolean;
}

function LeverSwitch({ label, checked, onChange, compact = false }: LeverSwitchProps): JSX.Element {
  return (
    <label className={compact ? "lever-switch compact" : "lever-switch"}>
      <input
        className="lever-input"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="lever-track">
        <span className="lever-thumb" />
        <span className="lever-led" />
      </span>
      <span className="lever-label">{label}</span>
    </label>
  );
}

function AccountAvatar({ platform }: { platform?: Platform }): JSX.Element {
  const [imageError, setImageError] = useState(false);
  const src = platform?.logoData || platform?.logoUrl || "";

  return (
    <div className="avatar">
      {src && !imageError ? (
        <img src={src} alt={platform?.name ?? "Platform"} onError={() => setImageError(true)} />
      ) : (
        <span>{displayInitials(platform?.name ?? "SeaViper")}</span>
      )}
    </div>
  );
}

function App(): JSX.Element {
  const location = useLocation();
  const mobileToken = useMemo(() => new URLSearchParams(location.search).get("t"), [location.search]);
  const isMobileRoute = location.pathname.startsWith("/mobile");

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [recoveryUnlocked, setRecoveryUnlocked] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeTab, setActiveTab] = useState<StageTab>("vault");
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [selectedForAutomation, setSelectedForAutomation] = useState<string[]>([]);
  const [launchRotatePasswords, setLaunchRotatePasswords] = useState(true);
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [automationJob, setAutomationJob] = useState<AutomationJob | null>(null);
  const [mobileUrl, setMobileUrl] = useState<string>("");
  const [mobileCandidateUrls, setMobileCandidateUrls] = useState<string[]>([]);
  const [recoveryBlob, setRecoveryBlob] = useState("");
  const [csvImportText, setCsvImportText] = useState("");
  const [csvImportFileName, setCsvImportFileName] = useState("");
  const [csvImportReport, setCsvImportReport] = useState<BrowserCsvImportResult | null>(null);

  const [setupMaster, setSetupMaster] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [setupRecoveryCode, setSetupRecoveryCode] = useState<string | null>(null);

  const [unlockMaster, setUnlockMaster] = useState("");
  const [unlockRecoveryCode, setUnlockRecoveryCode] = useState("");
  const [newMasterAfterRecovery, setNewMasterAfterRecovery] = useState("");

  const [kitPassphrase, setKitPassphrase] = useState("");
  const [importBlob, setImportBlob] = useState("");
  const [importPassphrase, setImportPassphrase] = useState("");

  const [newPlatformName, setNewPlatformName] = useState("");
  const [newPlatformUrl, setNewPlatformUrl] = useState("https://");
  const [newPlatformTag, setNewPlatformTag] = useState("Custom");
  const [newPlatformLogoUrl, setNewPlatformLogoUrl] = useState("");
  const [newPlatformLogoData, setNewPlatformLogoData] = useState<string | null>(null);

  const [mobileSessionToken, setMobileSessionToken] = useState<string | null>(null);
  const [mobileAccounts, setMobileAccounts] = useState<Account[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const nextStatus = await getStatus();
        setStatus(nextStatus);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Failed to load status.");
      }
    })();
  }, []);

  useEffect(() => {
    if (!settings) {
      return;
    }

    applyThemeToDocument(resolveTheme(settings.themeMode, settings.customTheme));
  }, [settings]);

  useEffect(() => {
    if (!authToken) {
      return;
    }

    void refreshSecureState(authToken);
  }, [authToken]);

  useEffect(() => {
    if (!isMobileRoute || !mobileToken) {
      return;
    }

    void (async () => {
      try {
        const consumed = await consumeMobileToken(mobileToken);
        setMobileSessionToken(consumed.token);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not open mobile session.");
      }
    })();
  }, [isMobileRoute, mobileToken]);

  useEffect(() => {
    if (!mobileSessionToken) {
      return;
    }

    void (async () => {
      try {
        const nextAccounts = await listAccounts(mobileSessionToken);
        setMobileAccounts(nextAccounts);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Failed to load mobile vault view.");
      }
    })();
  }, [mobileSessionToken]);

  useEffect(() => {
    if (!activeAccountId) {
      return;
    }

    const selected = accounts.find((account) => account.id === activeAccountId);
    if (!selected) {
      return;
    }

    setDraft({
      id: selected.id,
      platformId: selected.platformId,
      accountLabel: selected.accountLabel,
      loginUrl: selected.loginUrl,
      username: selected.username,
      password: selected.password,
      notes: selected.notes,
      tagsCsv: selected.tags.join(", "),
      passwordPolicy: selected.passwordPolicy
    });
  }, [activeAccountId, accounts]);

  useEffect(() => {
    if (!automationJob || !authToken) {
      return;
    }

    if (automationJob.status === "completed" || automationJob.status === "failed") {
      return;
    }

    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const next = await getAutomationJob(authToken, automationJob.id);
          setAutomationJob(next);
          if (next.status === "completed" || next.status === "failed") {
            window.clearInterval(timer);
            await refreshSecureState(authToken);
          }
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Failed to poll automation job.");
          window.clearInterval(timer);
        }
      })();
    }, 2000);

    return () => window.clearInterval(timer);
  }, [automationJob, authToken]);

  const platformMap = useMemo(() => {
    const map = new Map<string, Platform>();
    for (const platform of platforms) {
      map.set(platform.id, platform);
    }
    return map;
  }, [platforms]);

  const filteredAccounts = useMemo(() => {
    return accounts;
  }, [accounts]);

  const accountCountLabel = `${accounts.length} secured account${accounts.length === 1 ? "" : "s"}`;

  async function refreshSecureState(token: string): Promise<void> {
    try {
      const [nextSettings, nextPlatforms, nextAccounts] = await Promise.all([
        getSettings(token),
        listPlatforms(token),
        listAccounts(token)
      ]);

      setSettings(nextSettings);
      setPlatforms(nextPlatforms);
      setAccounts(nextAccounts);

      if (!draft.id && nextPlatforms[0]) {
        setDraft((current) => ({ ...current, platformId: nextPlatforms[0].id }));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to refresh vault state.");
    }
  }

  function clearStatus(): void {
    setError("");
    setMessage("");
  }

  async function handleSetup(): Promise<void> {
    clearStatus();

    if (setupMaster !== setupConfirm) {
      setError("Master password confirmation does not match.");
      return;
    }

    setBusy(true);
    try {
      const bootstrap = await bootstrapVault(setupMaster);
      setSetupRecoveryCode(bootstrap.recoveryCode);
      setStatus((current) => (current ? { ...current, initialized: true } : current));

      const unlocked = await unlockVault(setupMaster);
      setAuthToken(unlocked.token);
      setRecoveryUnlocked(unlocked.recoveryUnlocked);
      setMessage("Vault initialized and unlocked.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Vault setup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlockMaster(): Promise<void> {
    clearStatus();
    setBusy(true);

    try {
      const unlocked = await unlockVault(unlockMaster);
      setAuthToken(unlocked.token);
      setRecoveryUnlocked(unlocked.recoveryUnlocked);
      setMessage("Vault unlocked.");
      setUnlockMaster("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unlock failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlockRecovery(): Promise<void> {
    clearStatus();
    setBusy(true);

    try {
      const unlocked = await unlockVaultWithRecovery(unlockRecoveryCode);
      setAuthToken(unlocked.token);
      setRecoveryUnlocked(unlocked.recoveryUnlocked);
      setMessage("Recovery session unlocked. Set a new master password immediately.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Recovery unlock failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetMaster(): Promise<void> {
    if (!authToken) {
      return;
    }

    clearStatus();
    setBusy(true);

    try {
      await resetMasterPassword(authToken, newMasterAfterRecovery);
      setAuthToken(null);
      setRecoveryUnlocked(false);
      setMessage("Master password reset complete. Please unlock again with the new password.");
      setNewMasterAfterRecovery("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not reset master password.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLock(): Promise<void> {
    if (!authToken) {
      return;
    }

    try {
      await lockVault(authToken);
    } catch {
      // Intentional: force lock in UI even if server already revoked the session.
    }

    setAuthToken(null);
    setRecoveryUnlocked(false);
    setSettings(null);
    setPlatforms([]);
    setAccounts([]);
    setAutomationJob(null);
    setMessage("Vault locked and key wiped from memory.");
  }

  async function handleGenerateDraftPassword(): Promise<void> {
    if (!authToken) {
      return;
    }

    try {
      const generated = await generatePassword(authToken, draft.passwordPolicy);
      setDraft((current) => ({ ...current, password: generated.password }));
      setMessage("Generated a new secure password.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Password generation failed.");
    }
  }

  async function handleSaveAccount(): Promise<void> {
    if (!authToken) {
      return;
    }

    clearStatus();
    setBusy(true);

    const payload = {
      platformId: draft.platformId,
      accountLabel: draft.accountLabel,
      loginUrl: draft.loginUrl,
      username: draft.username,
      password: draft.password,
      notes: draft.notes,
      tags: draft.tagsCsv
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      passwordPolicy: draft.passwordPolicy
    };

    try {
      if (draft.id) {
        await updateAccount(authToken, draft.id, payload);
        setMessage("Account updated.");
      } else {
        await createAccount(authToken, payload);
        setMessage("Account created.");
      }

      await refreshSecureState(authToken);
      setDraft(emptyDraft(platforms[0]?.id));
      setActiveAccountId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to save account.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAccount(): Promise<void> {
    if (!authToken || !draft.id) {
      return;
    }

    clearStatus();
    setBusy(true);

    try {
      await deleteAccount(authToken, draft.id);
      setMessage("Account removed.");
      setDraft(emptyDraft(platforms[0]?.id));
      setActiveAccountId(null);
      await refreshSecureState(authToken);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to remove account.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRunAutomation(rotatePasswords: boolean): Promise<void> {
    if (!authToken || !settings) {
      return;
    }

    clearStatus();
    setBusy(true);

    try {
      const job = await startAutomation(authToken, {
        accountIds: selectedForAutomation.length ? selectedForAutomation : undefined,
        rotatePasswords,
        logoutAllDevices: settings.logoutAllDevicesDefault,
        rememberMe: settings.rememberMeDefault,
        passwordDefaults: settings.passwordDefaults
      });

      setAutomationJob(job);
      setMessage("Automation run started in your browser.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Automation start failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreatePlatform(): Promise<void> {
    if (!authToken) {
      return;
    }

    clearStatus();
    setBusy(true);

    try {
      await createPlatform(authToken, {
        name: newPlatformName,
        baseUrl: newPlatformUrl,
        tag: newPlatformTag,
        logoUrl: newPlatformLogoUrl || null,
        logoData: newPlatformLogoData
      });

      setMessage("Platform created.");
      setNewPlatformName("");
      setNewPlatformUrl("https://");
      setNewPlatformTag("Custom");
      setNewPlatformLogoUrl("");
      setNewPlatformLogoData(null);
      await refreshSecureState(authToken);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create platform.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePlatform(platformId: string): Promise<void> {
    if (!authToken) {
      return;
    }

    clearStatus();
    setBusy(true);

    try {
      await deletePlatform(authToken, platformId);
      setMessage("Platform removed.");
      await refreshSecureState(authToken);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove platform.");
    } finally {
      setBusy(false);
    }
  }

  async function handleThemeChange(mode: ThemeMode): Promise<void> {
    if (!authToken || !settings) {
      return;
    }

    try {
      const updated = await updateSettings(authToken, {
        themeMode: mode,
        customTheme: settings.customTheme
      });

      setSettings(updated);
      setMessage(`Theme changed to ${capitalizeMode(mode)}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to update theme.");
    }
  }

  async function handleUpdateCustomTheme(partial: Partial<ThemeVariables>): Promise<void> {
    if (!authToken || !settings) {
      return;
    }

    const nextTheme: ThemeVariables = {
      ...(settings.customTheme ?? THEME_PRESETS.dark),
      ...partial
    };

    try {
      const updated = await updateSettings(authToken, {
        themeMode: "custom",
        customTheme: nextTheme
      });

      setSettings(updated);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to save custom theme.");
    }
  }

  async function handleImportTheme(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    if (!event.target.files || event.target.files.length === 0 || !settings) {
      return;
    }

    const file = event.target.files[0];
    const text = await file.text();

    try {
      const parsed = JSON.parse(text) as ThemeVariables;
      await handleUpdateCustomTheme(parsed);
      setMessage("Custom theme imported.");
    } catch {
      setError("Theme file is invalid JSON or missing required fields.");
    }
  }

  async function handleCreateMobileUrl(): Promise<void> {
    if (!authToken) {
      return;
    }

    clearStatus();
    try {
      const share = await createMobileToken(authToken);
      setMobileUrl(share.mobileUrl);
      setMobileCandidateUrls(share.candidateUrls);
      setMessage("Single-use mobile sync token generated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not generate mobile link.");
    }
  }

  async function handleCreateRecoveryKit(): Promise<void> {
    if (!authToken) {
      return;
    }

    clearStatus();
    setBusy(true);

    try {
      const kit = await createRecoveryKit(authToken, kitPassphrase);
      setRecoveryBlob(kit.armoredBlob);

      const binary = atob(kit.pdfBase64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const fileBlob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(fileBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = kit.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setMessage("Recovery kit generated and PDF downloaded.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Recovery kit generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImportRecoveryKit(): Promise<void> {
    clearStatus();
    setBusy(true);

    try {
      await importRecoveryKit(importBlob, importPassphrase);
      const nextStatus = await getStatus();
      setStatus(nextStatus);
      setMessage("Recovery import completed. Unlock the vault to continue.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Recovery import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }

    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        setNewPlatformLogoData(reader.result);
      }
    };

    reader.readAsDataURL(file);
  }

  async function handleBrowserCsvUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }

    const file = event.target.files[0];
    const text = await file.text();
    setCsvImportText(text);
    setCsvImportFileName(file.name);
    setCsvImportReport(null);
    setMessage(`Loaded ${file.name}. Click Import to encrypt and store entries.`);
  }

  async function handleImportBrowserCsv(): Promise<void> {
    if (!authToken) {
      return;
    }

    if (!csvImportText) {
      setError("Upload a browser CSV file before importing.");
      return;
    }

    clearStatus();
    setBusy(true);

    try {
      const report = await importBrowserCsv(authToken, csvImportText);
      setCsvImportReport(report);
      await refreshSecureState(authToken);
      setMessage(
        `Imported ${report.imported} account(s), skipped ${report.skipped}. Auto-created platforms: ${report.autoCreatedPlatforms}.`
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Browser CSV import failed.");
    } finally {
      setBusy(false);
    }
  }

  function toggleAutomationSelection(accountId: string): void {
    setSelectedForAutomation((current) =>
      current.includes(accountId)
        ? current.filter((value) => value !== accountId)
        : [...current, accountId]
    );
  }

  async function handleMobileCopy(text: string): Promise<void> {
    const success = await robustCopyToClipboard(text);
    setMessage(success ? "Copied to clipboard." : "Copy failed on this device.");
  }

  if (isMobileRoute) {
    return (
      <div className="mobile-shell">
        <header className="mobile-header">
          <h1>SeaViperCascade Mobile Vault</h1>
          <p>Single-use tunnel over local network</p>
        </header>
        {error && <p className="error-banner">{error}</p>}
        {!mobileToken && <p className="error-banner">Missing mobile token in URL.</p>}
        {!mobileSessionToken && mobileToken && <p className="status-card">Opening secure session...</p>}
        <section className="mobile-list">
          {mobileAccounts.map((account) => (
            <article key={account.id} className="mobile-card">
              <h2>{account.accountLabel}</h2>
              <p>{account.loginUrl}</p>
              <div className="mobile-credential-row">
                <span>Username</span>
                <button type="button" onClick={() => void handleMobileCopy(account.username)}>
                  Copy
                </button>
              </div>
              <textarea readOnly value={account.username} className="mobile-hidden-copy-source" />
              <div className="mobile-credential-row">
                <span>Password</span>
                <button type="button" onClick={() => void handleMobileCopy(account.password)}>
                  Copy
                </button>
              </div>
              <textarea readOnly value={account.password} className="mobile-hidden-copy-source" />
            </article>
          ))}
        </section>
      </div>
    );
  }

  if (!status) {
    return <div className="splash">Loading SVC...</div>;
  }

  if (!status.initialized) {
    return (
      <div className="onboarding-shell">
        <div className="onboarding-card">
          <h1>Initialize Your SeaViperCascade Vault</h1>
          <p>Master password never leaves this device and never gets stored.</p>
          <label>
            Master password
            <input
              type="password"
              value={setupMaster}
              onChange={(event) => setSetupMaster(event.target.value)}
              placeholder="At least 12 characters"
            />
          </label>
          <label>
            Confirm master password
            <input
              type="password"
              value={setupConfirm}
              onChange={(event) => setSetupConfirm(event.target.value)}
            />
          </label>
          <button type="button" onClick={() => void handleSetup()} disabled={busy}>
            Create Vault
          </button>
          {setupRecoveryCode && (
            <div className="recovery-box">
              <h2>Emergency Recovery Code</h2>
              <p>Store this offline. It can unlock vault recovery mode if master password is forgotten.</p>
              <code>{setupRecoveryCode}</code>
              <button type="button" onClick={() => void handleMobileCopy(setupRecoveryCode)}>
                Copy Recovery Code
              </button>
            </div>
          )}
          {error && <p className="error-banner">{error}</p>}
          {message && <p className="status-card">{message}</p>}
        </div>
      </div>
    );
  }

  if (!authToken) {
    return (
      <div className="onboarding-shell">
        <div className="onboarding-card unlock-card">
          <h1>Unlock SVC Vault</h1>
          <div className="unlock-grid">
            <section>
              <h2>Master Login</h2>
              <input
                type="password"
                value={unlockMaster}
                onChange={(event) => setUnlockMaster(event.target.value)}
                placeholder="Master password"
              />
              <button type="button" onClick={() => void handleUnlockMaster()} disabled={busy}>
                Unlock
              </button>
            </section>
            <section>
              <h2>Recovery Unlock</h2>
              <input
                type="password"
                value={unlockRecoveryCode}
                onChange={(event) => setUnlockRecoveryCode(event.target.value)}
                placeholder="Recovery code"
              />
              <button type="button" onClick={() => void handleUnlockRecovery()} disabled={busy}>
                Unlock with Recovery
              </button>
            </section>
          </div>
          {error && <p className="error-banner">{error}</p>}
          {message && <p className="status-card">{message}</p>}
        </div>
      </div>
    );
  }

  if (!settings) {
    return <div className="splash">Loading encrypted vault state...</div>;
  }

  const selectedPlatform = platformMap.get(draft.platformId);
  const customTheme = settings.customTheme ?? THEME_PRESETS.dark;

  return (
    <div className="app-shell">
      <motion.header
        className="topbar"
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 20 }}
      >
        <div>
          <h1>SeaViperCascade Control Center</h1>
          <p>{accountCountLabel}</p>
        </div>
        <div className="topbar-actions">
          <button type="button" className="svc-button" onClick={() => void refreshSecureState(authToken)}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button type="button" className="svc-button" onClick={() => void handleLock()}>
            <Lock size={16} /> Lock Vault
          </button>
        </div>
      </motion.header>

      {recoveryUnlocked && (
        <div className="warning-banner">
          <AlertTriangle size={16} />
          <span>Recovery mode unlocked. Set a new master password immediately.</span>
          <input
            type="password"
            value={newMasterAfterRecovery}
            onChange={(event) => setNewMasterAfterRecovery(event.target.value)}
            placeholder="New master password"
          />
          <button type="button" onClick={() => void handleResetMaster()}>
            Reset Master
          </button>
        </div>
      )}

      {error && <p className="error-banner">{error}</p>}
      {message && <p className="status-card">{message}</p>}

      <main className="workspace-grid">
        <aside className="sidebar">
          <div className="sidebar-heading">
            <h2>Vault Accounts</h2>
            <button
              type="button"
              className="svc-button small"
              onClick={() => {
                clearStatus();
                setActiveTab("vault");
                setActiveAccountId(null);
                setDraft(emptyDraft(platforms[0]?.id));
                setMessage("Ready to add a new account.");
              }}
            >
              + New
            </button>
          </div>
          <motion.ul
            className="account-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
          >
            <AnimatePresence initial={false}>
              {filteredAccounts.map((account, index) => {
              const platform = platformMap.get(account.platformId);
              const selected = activeAccountId === account.id;
              return (
                <motion.li
                  layout
                  key={account.id}
                  className={selected ? "account-item selected" : "account-item"}
                  initial={{ opacity: 0, x: -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={{ type: "spring", stiffness: 280, damping: 22, delay: index * 0.04 }}
                >
                  <button
                    type="button"
                    className="account-select svc-button ghost"
                    onClick={() => setActiveAccountId(account.id)}
                  >
                    <AccountAvatar platform={platform} />
                    <span>
                      <strong>{account.accountLabel}</strong>
                      <small>{platform?.name ?? "Unknown platform"}</small>
                    </span>
                  </button>
                  <label className="multi-select queue-toggle">
                    <input
                      type="checkbox"
                      className="lever-input"
                      checked={selectedForAutomation.includes(account.id)}
                      onChange={() => toggleAutomationSelection(account.id)}
                    />
                    <span className="lever-track mini">
                      <span className="lever-thumb" />
                      <span className="lever-led" />
                    </span>
                    Queue
                  </label>
                </motion.li>
              );
            })}
            </AnimatePresence>
          </motion.ul>
        </aside>

        <section className="stage">
          <nav className="tab-strip">
            <button
              type="button"
              className={activeTab === "vault" ? "svc-button tab active" : "svc-button tab"}
              onClick={() => setActiveTab("vault")}
            >
              <Vault size={16} /> Vault
            </button>
            <button
              type="button"
              className={activeTab === "automation" ? "svc-button tab active" : "svc-button tab"}
              onClick={() => setActiveTab("automation")}
            >
              <Laptop size={16} /> Automation
            </button>
            <button
              type="button"
              className={activeTab === "platforms" ? "svc-button tab active" : "svc-button tab"}
              onClick={() => setActiveTab("platforms")}
            >
              <Server size={16} /> Platforms
            </button>
            <button
              type="button"
              className={activeTab === "themes" ? "svc-button tab active" : "svc-button tab"}
              onClick={() => setActiveTab("themes")}
            >
              <Brush size={16} /> Themes
            </button>
            <button
              type="button"
              className={activeTab === "mobile" ? "svc-button tab active" : "svc-button tab"}
              onClick={() => setActiveTab("mobile")}
            >
              <Smartphone size={16} /> Mobile
            </button>
            <button
              type="button"
              className={activeTab === "recovery" ? "svc-button tab active" : "svc-button tab"}
              onClick={() => setActiveTab("recovery")}
            >
              <Shield size={16} /> Recovery
            </button>
          </nav>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              className="stage-animate"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22 }}
            >

          {activeTab === "vault" && (
            <div className="panel-grid">
              <article className="panel">
                <h3>{draft.id ? "Edit Account" : "Add Account"}</h3>
                <label>
                  Platform
                  <select
                    value={draft.platformId}
                    onChange={(event) => setDraft((current) => ({ ...current, platformId: event.target.value }))}
                  >
                    <option value="">Select platform</option>
                    {platforms.map((platform) => (
                      <option key={platform.id} value={platform.id}>
                        {platform.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Account label
                  <input
                    value={draft.accountLabel}
                    onChange={(event) => setDraft((current) => ({ ...current, accountLabel: event.target.value }))}
                    placeholder="Primary, Work, Backup"
                  />
                </label>
                <label>
                  Login URL
                  <input
                    value={draft.loginUrl}
                    onChange={(event) => setDraft((current) => ({ ...current, loginUrl: event.target.value }))}
                  />
                </label>
                <label>
                  Username or email
                  <input
                    value={draft.username}
                    onChange={(event) => setDraft((current) => ({ ...current, username: event.target.value }))}
                  />
                </label>
                <label>
                  Password
                  <div className="inline-row">
                    <input
                      value={draft.password}
                      onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))}
                    />
                    <button type="button" onClick={() => void handleGenerateDraftPassword()}>
                      <KeyRound size={14} /> Generate
                    </button>
                    <button type="button" onClick={() => void handleMobileCopy(draft.password)}>
                      <Clipboard size={14} /> Copy
                    </button>
                  </div>
                </label>
                <label>
                  Notes
                  <textarea
                    value={draft.notes}
                    onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  />
                </label>
                <label>
                  Tags (comma separated)
                  <input
                    value={draft.tagsCsv}
                    onChange={(event) => setDraft((current) => ({ ...current, tagsCsv: event.target.value }))}
                    placeholder="Workplace, Entertainment"
                  />
                </label>
                <div className="policy-grid">
                  <label className="length-slider">
                    <span>
                      Password length <strong>{draft.passwordPolicy.length}</strong>
                    </span>
                    <input
                      type="range"
                      min={8}
                      max={128}
                      step={1}
                      value={draft.passwordPolicy.length}
                      onChange={(event) => {
                        const nextLength = Math.max(8, Math.min(128, Number(event.target.value)));
                        setDraft((current) => ({
                          ...current,
                          passwordPolicy: {
                            ...current.passwordPolicy,
                            length: nextLength
                          }
                        }));
                      }}
                    />
                    <div className="length-slider-scale">
                      <span>8</span>
                      <span>128</span>
                    </div>
                  </label>
                  <label className="policy-toggle">
                    <input
                      type="checkbox"
                      checked={draft.passwordPolicy.includeUppercase}
                      onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        passwordPolicy: {
                          ...current.passwordPolicy,
                          includeUppercase: event.target.checked
                        }
                      }))
                    }
                    />
                    Uppercase
                  </label>
                  <label className="policy-toggle">
                    <input
                      type="checkbox"
                      checked={draft.passwordPolicy.includeLowercase}
                      onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        passwordPolicy: {
                          ...current.passwordPolicy,
                          includeLowercase: event.target.checked
                        }
                      }))
                    }
                    />
                    Lowercase
                  </label>
                  <label className="policy-toggle">
                    <input
                      type="checkbox"
                      checked={draft.passwordPolicy.includeNumbers}
                      onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        passwordPolicy: {
                          ...current.passwordPolicy,
                          includeNumbers: event.target.checked
                        }
                      }))
                    }
                    />
                    Numbers
                  </label>
                  <label className="policy-toggle">
                    <input
                      type="checkbox"
                      checked={draft.passwordPolicy.includeSymbols}
                      onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        passwordPolicy: {
                          ...current.passwordPolicy,
                          includeSymbols: event.target.checked
                        }
                      }))
                    }
                    />
                    Symbols
                  </label>
                </div>

                <div className="action-row">
                  <button type="button" onClick={() => void handleSaveAccount()} disabled={busy}>
                    {draft.id ? "Update Account" : "Create Account"}
                  </button>
                  {draft.id && (
                    <button type="button" className="danger" onClick={() => void handleDeleteAccount()} disabled={busy}>
                      Delete
                    </button>
                  )}
                </div>
              </article>

              <article className="panel panel-preview">
                <h3>Selected Platform</h3>
                {selectedPlatform ? (
                  <>
                    <AccountAvatar platform={selectedPlatform} />
                    <h4>{selectedPlatform.name}</h4>
                    <p>{selectedPlatform.baseUrl}</p>
                    <p>Tag: {selectedPlatform.tag}</p>
                  </>
                ) : (
                  <p>Pick a platform to preview brand visuals and metadata.</p>
                )}
              </article>

              <article className="panel panel-import">
                <h3>Browser Password Import</h3>
                <p>
                  Export credentials as CSV from your browser, then import here. Browsers do not expose direct
                  vault APIs for local apps.
                </p>
                <label>
                  Browser CSV file
                  <input type="file" accept=".csv,text/csv" onChange={(event) => void handleBrowserCsvUpload(event)} />
                </label>
                {csvImportFileName && <p className="mono">Loaded file: {csvImportFileName}</p>}
                <button type="button" onClick={() => void handleImportBrowserCsv()} disabled={busy || !csvImportText}>
                  <Upload size={14} /> Import CSV
                </button>
                {csvImportReport && (
                  <div className="import-report">
                    <p>
                      Imported {csvImportReport.imported} | Skipped {csvImportReport.skipped} | Auto-created
                      platforms {csvImportReport.autoCreatedPlatforms}
                    </p>
                    {csvImportReport.warnings.length > 0 && (
                      <ul className="result-list">
                        {csvImportReport.warnings.map((warning, index) => (
                          <li key={`${index}-${warning}`}>{warning}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </article>
            </div>
          )}

          {activeTab === "automation" && (
            <div className="panel-grid">
              <article className="panel">
                <h3>Automation Engine</h3>
                <p>
                  Queue specific accounts from the sidebar or leave all unchecked to run across the whole vault.
                </p>
                <div className="lever-grid">
                  <LeverSwitch
                    label="Default: click logout all devices"
                    checked={settings.logoutAllDevicesDefault}
                    onChange={async (checked) => {
                      const updated = await updateSettings(authToken, {
                        logoutAllDevicesDefault: checked
                      });
                      setSettings(updated);
                    }}
                  />
                  <LeverSwitch
                    label="Default: check remember me"
                    checked={settings.rememberMeDefault}
                    onChange={async (checked) => {
                      const updated = await updateSettings(authToken, {
                        rememberMeDefault: checked
                      });
                      setSettings(updated);
                    }}
                  />
                  <LeverSwitch
                    label="Rotate passwords during run"
                    checked={launchRotatePasswords}
                    onChange={setLaunchRotatePasswords}
                  />
                </div>

                <div className="launch-centerpiece">
                  <p>
                    <Flame size={15} />
                    {selectedForAutomation.length > 0
                      ? ` ${selectedForAutomation.length} queued account(s) targeted.`
                      : " Full-vault mode enabled. All accounts will be processed."}
                  </p>
                  <motion.button
                    type="button"
                    className="launch-cascade"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.96 }}
                    animate={{ boxShadow: ["0 0 0 rgba(0,0,0,0)", "0 0 24px var(--svc-accent)", "0 0 0 rgba(0,0,0,0)"] }}
                    transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY }}
                    onClick={() => void handleRunAutomation(launchRotatePasswords)}
                    disabled={busy}
                  >
                    <Rocket size={18} /> Launch Cascade
                  </motion.button>
                </div>
              </article>

              <article className="panel">
                <h3>Automation Status</h3>
                {!automationJob && <p>No active job.</p>}
                {automationJob && (
                  <>
                    <p>
                      Status: <strong>{automationJob.status}</strong>
                    </p>
                    <p>Progress: {automationJob.progress}%</p>
                    <progress value={automationJob.progress} max={100} />
                    <ul className="result-list">
                      {automationJob.results.map((result) => (
                        <li key={`${result.accountId}-${result.details}`}>
                          <strong>{result.platformName}</strong> - {result.status} - {result.details}
                          {result.generatedPassword && <code>{result.generatedPassword}</code>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </article>
            </div>
          )}

          {activeTab === "platforms" && (
            <div className="panel-grid">
              <article className="panel">
                <h3>Add Custom Platform</h3>
                <label>
                  Name
                  <input value={newPlatformName} onChange={(event) => setNewPlatformName(event.target.value)} />
                </label>
                <label>
                  URL
                  <input value={newPlatformUrl} onChange={(event) => setNewPlatformUrl(event.target.value)} />
                </label>
                <label>
                  Tag
                  <input value={newPlatformTag} onChange={(event) => setNewPlatformTag(event.target.value)} />
                </label>
                <label>
                  Logo URL (optional)
                  <input
                    value={newPlatformLogoUrl}
                    onChange={(event) => setNewPlatformLogoUrl(event.target.value)}
                  />
                </label>
                <label>
                  Upload Logo
                  <input type="file" accept="image/*" onChange={(event) => void handleLogoUpload(event)} />
                </label>
                <button type="button" onClick={() => void handleCreatePlatform()} disabled={busy}>
                  Add Platform
                </button>
              </article>

              <article className="panel">
                <h3>Platform Inventory</h3>
                <ul className="platform-list">
                  {platforms.map((platform) => (
                    <li key={platform.id}>
                      <div>
                        <AccountAvatar platform={platform} />
                        <span>
                          <strong>{platform.name}</strong>
                          <small>{platform.tag}</small>
                        </span>
                      </div>
                      <button type="button" className="danger" onClick={() => void handleDeletePlatform(platform.id)}>
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          )}

          {activeTab === "themes" && (
            <div className="panel-grid">
              <article className="panel">
                <h3>Theme Studio</h3>
                <div className="chip-grid">
                  {(["dark", "light", "green", "yellow", "pink", "custom"] as ThemeMode[]).map((mode) => (
                    <button
                      type="button"
                      key={mode}
                      className={settings.themeMode === mode ? "chip active" : "chip"}
                      onClick={() => void handleThemeChange(mode)}
                    >
                      {capitalizeMode(mode)}
                    </button>
                  ))}
                </div>

                {settings.themeMode === "custom" && (
                  <div className="theme-editor">
                    {Object.entries(customTheme).map(([key, value]) => (
                      <label key={key}>
                        {key}
                        <input
                          value={value}
                          onChange={(event) =>
                            void handleUpdateCustomTheme({ [key]: event.target.value } as Partial<ThemeVariables>)
                          }
                        />
                      </label>
                    ))}
                    <label>
                      Import custom theme JSON
                      <input type="file" accept="application/json" onChange={(event) => void handleImportTheme(event)} />
                    </label>
                  </div>
                )}
              </article>

              <article className="panel">
                <h3>Theme Preview</h3>
                <p>Live preview applies to entire dashboard instantly.</p>
                <div className="theme-preview-box">
                  <p>Accent sample</p>
                  <button type="button">Action Button</button>
                </div>
              </article>
            </div>
          )}

          {activeTab === "mobile" && (
            <div className="panel-grid">
              <article className="panel">
                <h3>Mobile Sync Token</h3>
                <p>
                  Generate a single-use QR URL for devices on the same Wi-Fi. Token expires automatically.
                </p>
                <button type="button" onClick={() => void handleCreateMobileUrl()}>
                  <Smartphone size={14} /> Generate Mobile Link
                </button>
                {mobileUrl && (
                  <>
                    <div className="qr-frame">
                      <QRCodeSVG value={mobileUrl} size={196} fgColor="var(--svc-text)" bgColor="transparent" />
                    </div>
                    <p className="mono">{mobileUrl}</p>
                    <button type="button" onClick={() => void handleMobileCopy(mobileUrl)}>
                      Copy URL
                    </button>
                  </>
                )}
              </article>

              <article className="panel">
                <h3>Alternate Local URLs</h3>
                <ul className="candidate-url-list">
                  {mobileCandidateUrls.map((url) => (
                    <li key={url}>{url}</li>
                  ))}
                </ul>
              </article>
            </div>
          )}

          {activeTab === "recovery" && (
            <div className="panel-grid">
              <article className="panel">
                <h3>Create Emergency Recovery Kit</h3>
                <label>
                  Kit passphrase
                  <input
                    type="password"
                    value={kitPassphrase}
                    onChange={(event) => setKitPassphrase(event.target.value)}
                  />
                </label>
                <button type="button" onClick={() => void handleCreateRecoveryKit()}>
                  <Download size={14} /> Generate PDF Kit
                </button>
                {recoveryBlob && (
                  <>
                    <textarea className="recovery-text" value={recoveryBlob} readOnly />
                    <button type="button" onClick={() => void handleMobileCopy(recoveryBlob)}>
                      Copy Recovery Blob
                    </button>
                  </>
                )}
              </article>

              <article className="panel">
                <h3>Import Recovery Kit</h3>
                <label>
                  Armored blob
                  <textarea
                    className="recovery-text"
                    value={importBlob}
                    onChange={(event) => setImportBlob(event.target.value)}
                  />
                </label>
                <label>
                  Kit passphrase
                  <input
                    type="password"
                    value={importPassphrase}
                    onChange={(event) => setImportPassphrase(event.target.value)}
                  />
                </label>
                <button type="button" onClick={() => void handleImportRecoveryKit()}>
                  Import Snapshot
                </button>
              </article>
            </div>
          )}
            </motion.div>
          </AnimatePresence>
        </section>
      </main>

      <footer className="footer">
        <UserRound size={14} /> SeaViperCascade local runtime | <Server size={14} /> Install ID: {status.installId}
      </footer>
    </div>
  );
}

export default App;
