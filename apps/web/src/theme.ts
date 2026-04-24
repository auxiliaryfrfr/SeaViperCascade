import type { ThemeMode, ThemeVariables } from "./types";

export const THEME_PRESETS: Record<Exclude<ThemeMode, "custom">, ThemeVariables> = {
  dark: {
    background: "#000000",
    backgroundElevated: "linear-gradient(160deg, #0a0d12, #000000)",
    surface: "rgba(9, 13, 20, 0.9)",
    border: "rgba(108, 142, 186, 0.38)",
    textPrimary: "#f2f7ff",
    textMuted: "#93a9c4",
    accent: "#6aa8ff",
    accentAlt: "#00d3b1"
  },
  light: {
    background: "#eef2f4",
    backgroundElevated: "linear-gradient(145deg, #ffffff, #dce6ea)",
    surface: "rgba(255, 255, 255, 0.88)",
    border: "rgba(40, 54, 64, 0.22)",
    textPrimary: "#10212d",
    textMuted: "#4f6678",
    accent: "#135fce",
    accentAlt: "#008b77"
  },
  green: {
    background: "#071610",
    backgroundElevated: "linear-gradient(145deg, #0f2a1c, #0a1f15)",
    surface: "rgba(10, 31, 21, 0.9)",
    border: "rgba(109, 196, 134, 0.35)",
    textPrimary: "#e9ffe5",
    textMuted: "#b2d3ba",
    accent: "#5fdd44",
    accentAlt: "#21c985"
  },
  yellow: {
    background: "#191408",
    backgroundElevated: "linear-gradient(145deg, #32260f, #231a0a)",
    surface: "rgba(35, 26, 10, 0.9)",
    border: "rgba(236, 194, 88, 0.35)",
    textPrimary: "#fff8de",
    textMuted: "#d4c79f",
    accent: "#ffcc30",
    accentAlt: "#ff9840"
  },
  pink: {
    background: "#1b0a17",
    backgroundElevated: "linear-gradient(145deg, #35122d, #240c1f)",
    surface: "rgba(36, 12, 31, 0.9)",
    border: "rgba(236, 114, 199, 0.35)",
    textPrimary: "#ffe9f7",
    textMuted: "#d8a7c8",
    accent: "#ff5fb2",
    accentAlt: "#ff8a56"
  }
};

export function resolveTheme(mode: ThemeMode, customTheme: ThemeVariables | null): ThemeVariables {
  if (mode === "custom") {
    return customTheme ?? THEME_PRESETS.dark;
  }

  return THEME_PRESETS[mode];
}

export function applyThemeToDocument(theme: ThemeVariables): void {
  const root = document.documentElement;
  root.style.setProperty("--svc-bg", theme.background);
  root.style.setProperty("--svc-bg-elevated", theme.backgroundElevated);
  root.style.setProperty("--svc-surface", theme.surface);
  root.style.setProperty("--svc-border", theme.border);
  root.style.setProperty("--svc-text", theme.textPrimary);
  root.style.setProperty("--svc-muted", theme.textMuted);
  root.style.setProperty("--svc-accent", theme.accent);
  root.style.setProperty("--svc-accent-alt", theme.accentAlt);
}
