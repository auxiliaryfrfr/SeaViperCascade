export type ThemeMode = "dark" | "light" | "green" | "yellow" | "pink" | "custom";

export interface ThemeVariables {
  background: string;
  backgroundElevated: string;
  surface: string;
  border: string;
  textPrimary: string;
  textMuted: string;
  accent: string;
  accentAlt: string;
}

export interface PasswordDefaults {
  length: number;
  includeUppercase: boolean;
  includeLowercase: boolean;
  includeNumbers: boolean;
  includeSymbols: boolean;
}

export interface AppSettings {
  themeMode: ThemeMode;
  customTheme: ThemeVariables | null;
  logoutAllDevicesDefault: boolean;
  rememberMeDefault: boolean;
  passwordDefaults: PasswordDefaults;
}

export interface StatusResponse {
  initialized: boolean;
  installId: string;
  lanAddresses: string[];
  webOrigin: string;
}

export interface UnlockResponse {
  token: string;
  recoveryUnlocked: boolean;
  mobile: boolean;
}

export interface Platform {
  id: string;
  name: string;
  baseUrl: string;
  tag: string;
  logoUrl: string | null;
  logoData: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  platformId: string;
  accountLabel: string;
  loginUrl: string;
  username: string;
  password: string;
  notes: string;
  tags: string[];
  passwordPolicy: PasswordDefaults;
  createdAt: string;
  updatedAt: string;
  lastRotatedAt: string | null;
}

export interface AutomationResult {
  accountId: string;
  platformName: string;
  status: "success" | "manual_required" | "failed";
  details: string;
  generatedPassword?: string;
}

export interface AutomationJob {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  total: number;
  results: AutomationResult[];
  error?: string;
}

export interface BrowserCsvImportResult {
  imported: number;
  skipped: number;
  autoCreatedPlatforms: number;
  warnings: string[];
}
