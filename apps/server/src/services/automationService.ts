import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { generateSecurePassword, normalizePasswordDefaults } from "../lib/password";
import type { AutomationJob, PasswordDefaults, SessionContext } from "../types";
import { getVaultAccount, listVaultAccounts, setVaultPassword } from "./accountService";
import { resolveAutomationProfile, type AutomationProfile } from "../automation/profiles";
import { listPlatforms } from "./platformService";
import { readSettings } from "./settingsService";

interface StartAutomationInput {
  accountIds?: string[];
  rotatePasswords: boolean;
  passwordDefaults?: Partial<PasswordDefaults>;
  logoutAllDevices?: boolean;
  rememberMe?: boolean;
}

const jobs = new Map<string, AutomationJob>();

const DEFAULT_USERNAME_SELECTORS = [
  'input[type="email"]',
  'input[name*="email" i]',
  'input[name*="user" i]',
  'input[id*="user" i]',
  'input[type="text"]'
];

const DEFAULT_PASSWORD_SELECTORS = [
  'input[autocomplete="current-password"]',
  'input[type="password"]'
];

const DEFAULT_LOGIN_LABELS = ["Sign in", "Log in", "Continue", "Next"];
const DEFAULT_REMEMBER_ME_LABELS = ["remember me", "keep me signed in", "stay signed in"];
const DEFAULT_LOGOUT_ALL_LABELS = [
  "logout of all devices",
  "log out all sessions",
  "sign out everywhere"
];
const DEFAULT_SECURITY_PAGE_LABELS = ["security", "password", "change password", "account settings"];
const DEFAULT_PASSWORD_SUBMIT_LABELS = ["save", "update password", "change password", "submit"];

const DEFAULT_CURRENT_PASSWORD_SELECTORS = [
  'input[autocomplete="current-password"]',
  'input[type="password"][name*="current" i]',
  'input[type="password"][id*="current" i]'
];

const DEFAULT_NEW_PASSWORD_SELECTORS = [
  'input[autocomplete="new-password"]',
  'input[type="password"][name*="new" i]',
  'input[type="password"][id*="new" i]'
];

const DEFAULT_CONFIRM_PASSWORD_SELECTORS = [
  'input[type="password"][name*="confirm" i]',
  'input[type="password"][id*="confirm" i]',
  'input[type="password"][name*="repeat" i]'
];

function mergeSelectorList(profileList: string[] | undefined, defaults: string[]): string[] {
  if (!profileList?.length) {
    return defaults;
  }

  return [...profileList, ...defaults];
}

function toRegexList(labels: string[]): RegExp[] {
  return labels.map((label) => new RegExp(`^\\s*${label}\\s*$`, "i"));
}

async function tryFillFirst(page: Page, selectors: string[], value: string): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      await locator.fill(value, { timeout: 3000 });
      return true;
    }
  }

  return false;
}

async function tryCheckByLabel(page: Page, patterns: RegExp[], checked: boolean): Promise<boolean> {
  for (const pattern of patterns) {
    const locator = page.getByLabel(pattern).first();
    if ((await locator.count()) > 0) {
      if (checked) {
        await locator.check({ timeout: 3000 });
      } else {
        await locator.uncheck({ timeout: 3000 });
      }
      return true;
    }
  }

  return false;
}

async function tryClickButtons(page: Page, labels: RegExp[]): Promise<boolean> {
  for (const label of labels) {
    const button = page.getByRole("button", { name: label }).first();
    if ((await button.count()) > 0) {
      await button.click({ timeout: 3000 });
      return true;
    }

    const link = page.getByRole("link", { name: label }).first();
    if ((await link.count()) > 0) {
      await link.click({ timeout: 3000 });
      return true;
    }
  }

  return false;
}

async function hasHumanChallenge(page: Page): Promise<boolean> {
  const bodyText = (await page.locator("body").innerText()).toLowerCase();
  return (
    bodyText.includes("captcha") ||
    bodyText.includes("two-factor") ||
    bodyText.includes("2fa") ||
    bodyText.includes("verification code")
  );
}

async function attemptPasswordChange(
  page: Page,
  currentPassword: string,
  nextPassword: string,
  profile: AutomationProfile | null
): Promise<boolean> {
  const securityLabels = mergeSelectorList(profile?.securityPageLabels, DEFAULT_SECURITY_PAGE_LABELS);
  await tryClickButtons(page, toRegexList(securityLabels));

  const currentFound = await tryFillFirst(
    page,
    mergeSelectorList(profile?.currentPasswordSelectors, DEFAULT_CURRENT_PASSWORD_SELECTORS),
    currentPassword
  );

  const nextFound = await tryFillFirst(
    page,
    mergeSelectorList(profile?.newPasswordSelectors, DEFAULT_NEW_PASSWORD_SELECTORS),
    nextPassword
  );

  const confirmFound = await tryFillFirst(
    page,
    mergeSelectorList(profile?.confirmPasswordSelectors, DEFAULT_CONFIRM_PASSWORD_SELECTORS),
    nextPassword
  );

  if (!nextFound || !confirmFound || !currentFound) {
    return false;
  }

  const submitLabels = mergeSelectorList(profile?.passwordSubmitLabels, DEFAULT_PASSWORD_SUBMIT_LABELS);
  await tryClickButtons(page, toRegexList(submitLabels));

  await page.waitForTimeout(2500);

  if (await hasHumanChallenge(page)) {
    return false;
  }

  return true;
}

async function processAccount(
  page: Page,
  session: SessionContext,
  accountId: string,
  settings: ReturnType<typeof readSettings>,
  input: StartAutomationInput
): Promise<AutomationJob["results"][number]> {
  const account = getVaultAccount(session, accountId);
  const platforms = listPlatforms();
  const platform = platforms.find((item) => item.id === account.platformId);
  const profile = resolveAutomationProfile([account.loginUrl, platform?.baseUrl]);

  const rememberMeEnabled = input.rememberMe ?? settings.rememberMeDefault;
  const logoutEnabled = input.logoutAllDevices ?? settings.logoutAllDevicesDefault;

  await page.goto(account.loginUrl || platform?.baseUrl || "about:blank", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  const userFound = await tryFillFirst(
    page,
    mergeSelectorList(profile?.usernameSelectors, DEFAULT_USERNAME_SELECTORS),
    account.username
  );

  const passwordFound = await tryFillFirst(
    page,
    mergeSelectorList(profile?.passwordSelectors, DEFAULT_PASSWORD_SELECTORS),
    account.password
  );

  if (rememberMeEnabled) {
    const rememberLabels = mergeSelectorList(profile?.rememberMeLabels, DEFAULT_REMEMBER_ME_LABELS);
    await tryCheckByLabel(page, toRegexList(rememberLabels), true);
  }

  if (userFound || passwordFound) {
    const loginLabels = mergeSelectorList(profile?.loginActionLabels, DEFAULT_LOGIN_LABELS);
    await tryClickButtons(page, toRegexList(loginLabels));
  }

  await page.waitForTimeout(2000);

  if (await hasHumanChallenge(page)) {
    return {
      accountId,
      platformName: platform?.name ?? "Unknown",
      status: "manual_required",
      details: "Detected CAPTCHA/2FA challenge. Tab left open for manual completion."
    };
  }

  if (logoutEnabled) {
    const logoutLabels = mergeSelectorList(profile?.logoutAllLabels, DEFAULT_LOGOUT_ALL_LABELS);
    await tryClickButtons(page, toRegexList(logoutLabels));
  }

  if (!input.rotatePasswords) {
    return {
      accountId,
      platformName: platform?.name ?? "Unknown",
      status: "success",
      details: "Credentials loaded and automation checks executed."
    };
  }

  const mergedPolicy = normalizePasswordDefaults({
    ...settings.passwordDefaults,
    ...account.passwordPolicy,
    ...(input.passwordDefaults ?? {})
  });

  const generatedPassword = generateSecurePassword(mergedPolicy);
  const changed = await attemptPasswordChange(page, account.password, generatedPassword, profile);

  if (!changed) {
    return {
      accountId,
      platformName: platform?.name ?? "Unknown",
      status: "manual_required",
      details: "Automatic password rotation was not possible. Tab remains open for manual completion.",
      generatedPassword
    };
  }

  setVaultPassword(session, accountId, generatedPassword, mergedPolicy);

  return {
    accountId,
    platformName: platform?.name ?? "Unknown",
    status: "success",
    details: "Password rotated and vault updated.",
    generatedPassword
  };
}

async function launchBrowser(): Promise<{ browser: Browser; context: BrowserContext }> {
  const preferredChannels = process.platform === "win32" ? ["msedge", "chrome"] : ["chrome"];

  for (const channel of preferredChannels) {
    try {
      const browser = await chromium.launch({ headless: false, channel: channel as "chrome" | "msedge" });
      const context = await browser.newContext();
      return { browser, context };
    } catch {
      continue;
    }
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  return { browser, context };
}

async function runJob(jobId: string, session: SessionContext, input: StartAutomationInput): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }

  job.status = "running";
  job.updatedAt = Date.now();

  const settings = readSettings();
  const allAccounts = listVaultAccounts(session);
  const selected = input.accountIds?.length
    ? allAccounts.filter((account) => input.accountIds?.includes(account.id))
    : allAccounts;

  job.total = selected.length;

  if (selected.length === 0) {
    job.status = "completed";
    job.progress = 100;
    job.updatedAt = Date.now();
    return;
  }

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;

  try {
    const launched = await launchBrowser();
    browser = launched.browser;
    context = launched.context;

    for (let index = 0; index < selected.length; index += 1) {
      const account = selected[index];
      const page = await context.newPage();

      try {
        const result = await processAccount(page, session, account.id, settings, input);
        job.results.push(result);

        if (result.status === "success") {
          await page.close();
        }
      } catch (error) {
        job.results.push({
          accountId: account.id,
          platformName: account.accountLabel,
          status: "failed",
          details: error instanceof Error ? error.message : "Unknown automation error"
        });
      }

      job.progress = Math.round(((index + 1) / selected.length) * 100);
      job.updatedAt = Date.now();
    }

    job.status = "completed";
    job.updatedAt = Date.now();
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Automation engine failed";
    job.updatedAt = Date.now();
  } finally {
    const manualPages = job.results.filter((item) => item.status === "manual_required").length;

    if (context) {
      const openPages = context.pages();
      if (manualPages === 0) {
        await context.close();
      } else {
        for (const page of openPages) {
          page.bringToFront().catch(() => undefined);
        }
      }
    }

    if (browser && browser.isConnected() && manualPages === 0) {
      await browser.close().catch(() => undefined);
    }
  }
}

export function startAutomationJob(session: SessionContext, input: StartAutomationInput): AutomationJob {
  const id = crypto.randomUUID();
  const job: AutomationJob = {
    id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: "queued",
    progress: 0,
    total: 0,
    results: []
  };

  jobs.set(id, job);
  void runJob(id, session, input);
  return job;
}

export function getAutomationJob(jobId: string): AutomationJob {
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error("Automation job not found.");
  }

  return job;
}
