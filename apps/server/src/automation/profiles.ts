export interface AutomationProfile {
  id: string;
  hostMatches: string[];
  usernameSelectors?: string[];
  passwordSelectors?: string[];
  currentPasswordSelectors?: string[];
  newPasswordSelectors?: string[];
  confirmPasswordSelectors?: string[];
  loginActionLabels?: string[];
  rememberMeLabels?: string[];
  logoutAllLabels?: string[];
  securityPageLabels?: string[];
  passwordSubmitLabels?: string[];
}

const AUTOMATION_PROFILES: AutomationProfile[] = [
  {
    id: "google",
    hostMatches: ["google.com", "youtube.com", "gmail.com"],
    usernameSelectors: [
      'input[type="email"][name="identifier"]',
      'input[type="email"][id="identifierId"]'
    ],
    passwordSelectors: ['input[type="password"][name="Passwd"]'],
    loginActionLabels: ["Next", "Sign in"],
    rememberMeLabels: ["Stay signed in", "Remember me"],
    securityPageLabels: ["Security", "Password", "Manage your Google Account"],
    passwordSubmitLabels: ["Change password", "Save"]
  },
  {
    id: "microsoft",
    hostMatches: ["live.com", "microsoft.com", "office.com"],
    usernameSelectors: [
      'input[type="email"][name="loginfmt"]',
      'input[type="email"][name="username"]'
    ],
    passwordSelectors: ['input[type="password"][name="passwd"]'],
    loginActionLabels: ["Next", "Sign in"],
    rememberMeLabels: ["Stay signed in", "Keep me signed in"],
    securityPageLabels: ["Security", "Password security", "Password"],
    passwordSubmitLabels: ["Save", "Change password"]
  },
  {
    id: "meta",
    hostMatches: ["facebook.com", "instagram.com"],
    usernameSelectors: [
      'input[name="email"]',
      'input[name="username"]'
    ],
    passwordSelectors: ['input[name="pass"]', 'input[type="password"]'],
    loginActionLabels: ["Log in", "Continue"],
    rememberMeLabels: ["Remember me", "Keep me signed in"],
    logoutAllLabels: ["Log out of all sessions", "Log out of all devices"],
    securityPageLabels: ["Password and security", "Security", "Password"],
    passwordSubmitLabels: ["Save changes", "Update password", "Change password"]
  }
];

function hostFromUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) {
    return null;
  }

  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hostMatches(hostname: string, profileHost: string): boolean {
  return hostname === profileHost || hostname.endsWith(`.${profileHost}`);
}

export function resolveAutomationProfile(urls: Array<string | undefined>): AutomationProfile | null {
  const hosts = urls
    .map((url) => hostFromUrl(url))
    .filter((host): host is string => Boolean(host));

  if (!hosts.length) {
    return null;
  }

  for (const profile of AUTOMATION_PROFILES) {
    if (
      hosts.some((host) =>
        profile.hostMatches.some((profileHost) => hostMatches(host, profileHost))
      )
    ) {
      return profile;
    }
  }

  return null;
}

export function listAutomationProfiles(): AutomationProfile[] {
  return AUTOMATION_PROFILES;
}
