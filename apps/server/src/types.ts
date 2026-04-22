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

export interface PlatformRecord {
  id: string;
  name: string;
  baseUrl: string;
  tag: string;
  logoUrl: string | null;
  logoData: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountRecord {
  id: string;
  platformId: string;
  accountLabel: string;
  loginUrl: string;
  usernameEnc: string;
  passwordEnc: string;
  notesEnc: string;
  tags: string;
  passwordPolicy: string;
  createdAt: string;
  updatedAt: string;
  lastRotatedAt: string | null;
}

export interface VaultAccount {
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

export interface SessionContext {
  token: string;
  dek: Buffer;
  createdAt: number;
  expiresAt: number;
  mobile: boolean;
  recoveryUnlocked: boolean;
}

export interface AutomationStepResult {
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
  results: AutomationStepResult[];
  error?: string;
}

export interface RecoveryBlob {
  version: "SVC-KIT-1";
  createdAt: string;
  salt: string;
  cipherText: string;
  checksum: string;
}
