import type {
  Account,
  AppSettings,
  AutomationJob,
  BrowserCsvImportResult,
  Platform,
  StatusResponse,
  UnlockResponse
} from "./types";

async function request<T>(
  path: string,
  options?: RequestInit,
  token?: string
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {})
    }
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function getStatus(): Promise<StatusResponse> {
  return request<StatusResponse>("/api/status");
}

export function bootstrapVault(masterPassword: string): Promise<{ recoveryCode: string }> {
  return request<{ recoveryCode: string }>("/api/bootstrap", {
    method: "POST",
    body: JSON.stringify({ masterPassword })
  });
}

export function unlockVault(masterPassword: string): Promise<UnlockResponse> {
  return request<UnlockResponse>("/api/auth/unlock", {
    method: "POST",
    body: JSON.stringify({ masterPassword })
  });
}

export function unlockVaultWithRecovery(recoveryCode: string): Promise<UnlockResponse> {
  return request<UnlockResponse>("/api/auth/unlock-recovery", {
    method: "POST",
    body: JSON.stringify({ recoveryCode })
  });
}

export function resetMasterPassword(token: string, newMasterPassword: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(
    "/api/auth/reset-master",
    {
      method: "POST",
      body: JSON.stringify({ newMasterPassword })
    },
    token
  );
}

export function lockVault(token: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/api/auth/lock", { method: "POST" }, token);
}

export function getSettings(token: string): Promise<AppSettings> {
  return request<AppSettings>("/api/settings", undefined, token);
}

export function updateSettings(token: string, payload: Partial<AppSettings>): Promise<AppSettings> {
  return request<AppSettings>(
    "/api/settings",
    {
      method: "PUT",
      body: JSON.stringify(payload)
    },
    token
  );
}

export function listPlatforms(token: string): Promise<Platform[]> {
  return request<Platform[]>("/api/platforms", undefined, token);
}

export function createPlatform(token: string, payload: Partial<Platform> & { name: string; baseUrl: string; tag: string }): Promise<Platform> {
  return request<Platform>(
    "/api/platforms",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    token
  );
}

export function deletePlatform(token: string, platformId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/platforms/${platformId}`, { method: "DELETE" }, token);
}

export function listAccounts(token: string): Promise<Account[]> {
  return request<Account[]>("/api/accounts", undefined, token);
}

export function createAccount(token: string, payload: Omit<Account, "id" | "createdAt" | "updatedAt" | "lastRotatedAt">): Promise<Account> {
  return request<Account>(
    "/api/accounts",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    token
  );
}

export function updateAccount(token: string, id: string, payload: Omit<Account, "id" | "createdAt" | "updatedAt" | "lastRotatedAt">): Promise<Account> {
  return request<Account>(
    `/api/accounts/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(payload)
    },
    token
  );
}

export function deleteAccount(token: string, id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/accounts/${id}`, { method: "DELETE" }, token);
}

export function importBrowserCsv(token: string, csvText: string): Promise<BrowserCsvImportResult> {
  return request<BrowserCsvImportResult>(
    "/api/accounts/import-csv",
    {
      method: "POST",
      body: JSON.stringify({ csvText })
    },
    token
  );
}

export function generatePassword(
  token: string,
  payload: {
    length: number;
    includeUppercase: boolean;
    includeLowercase: boolean;
    includeNumbers: boolean;
    includeSymbols: boolean;
  }
): Promise<{ password: string }> {
  return request<{ password: string }>(
    "/api/password/generate",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    token
  );
}

export function startAutomation(
  token: string,
  payload: {
    accountIds?: string[];
    rotatePasswords: boolean;
    logoutAllDevices?: boolean;
    rememberMe?: boolean;
    passwordDefaults?: {
      length: number;
      includeUppercase: boolean;
      includeLowercase: boolean;
      includeNumbers: boolean;
      includeSymbols: boolean;
    };
  }
): Promise<AutomationJob> {
  return request<AutomationJob>(
    "/api/automation/jobs",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    token
  );
}

export function getAutomationJob(token: string, id: string): Promise<AutomationJob> {
  return request<AutomationJob>(`/api/automation/jobs/${id}`, undefined, token);
}

export function createMobileToken(token: string): Promise<{ token: string; mobileUrl: string; candidateUrls: string[]; expiresInSeconds: number }> {
  return request<{ token: string; mobileUrl: string; candidateUrls: string[]; expiresInSeconds: number }>(
    "/api/mobile/token",
    {
      method: "POST",
      body: JSON.stringify({})
    },
    token
  );
}

export function consumeMobileToken(shareToken: string): Promise<{ token: string }> {
  return request<{ token: string }>(
    "/api/mobile/consume",
    {
      method: "POST",
      body: JSON.stringify({ token: shareToken })
    }
  );
}

export function createRecoveryKit(
  token: string,
  passphrase: string
): Promise<{ fileName: string; filePath: string; armoredBlob: string; pdfBase64: string }> {
  return request<{ fileName: string; filePath: string; armoredBlob: string; pdfBase64: string }>(
    "/api/recovery/kit",
    {
      method: "POST",
      body: JSON.stringify({ passphrase })
    },
    token
  );
}

export function importRecoveryKit(armoredBlob: string, passphrase: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(
    "/api/recovery/import",
    {
      method: "POST",
      body: JSON.stringify({ armoredBlob, passphrase })
    }
  );
}
