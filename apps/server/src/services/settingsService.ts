import { getSettings, saveSettings } from "./database";
import { normalizePasswordDefaults } from "../lib/password";
import type { AppSettings } from "../types";

type SettingsUpdate = {
  themeMode?: AppSettings["themeMode"];
  customTheme?: AppSettings["customTheme"];
  logoutAllDevicesDefault?: boolean;
  rememberMeDefault?: boolean;
  passwordDefaults?: Partial<AppSettings["passwordDefaults"]>;
};

export function readSettings(): AppSettings {
  return getSettings();
}

export function updateSettings(input: SettingsUpdate): AppSettings {
  const current = getSettings();

  const merged: AppSettings = {
    themeMode: input.themeMode ?? current.themeMode,
    customTheme:
      input.customTheme === undefined
        ? current.customTheme
        : input.customTheme,
    logoutAllDevicesDefault: input.logoutAllDevicesDefault ?? current.logoutAllDevicesDefault,
    rememberMeDefault: input.rememberMeDefault ?? current.rememberMeDefault,
    passwordDefaults: normalizePasswordDefaults({
      ...current.passwordDefaults,
      ...(input.passwordDefaults ?? {})
    })
  };

  saveSettings(merged);
  return merged;
}
