export const UI_THEME_KEY = "ui_theme";

export type UiTheme = {
  primary: string;
  primaryForeground: string;
  sectionAccent: string;
  background: string;
  sidebar: string;
  text: string;
  headingText: string;
  sidebarText: string;
};

export const DEFAULT_UI_THEME: UiTheme = {
  primary: "#087e82",
  primaryForeground: "#ffffff",
  sectionAccent: "#e7f2ee",
  background: "#fbfdfc",
  sidebar: "#ffffff",
  text: "#17343d",
  headingText: "#17343d",
  sidebarText: "#64748b",
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function parseUiTheme(value: unknown): UiTheme {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object") return DEFAULT_UI_THEME;
    const candidate = parsed as Partial<UiTheme>;
    return {
      primary: HEX_COLOR.test(candidate.primary ?? "")
        ? candidate.primary!
        : DEFAULT_UI_THEME.primary,
      primaryForeground: HEX_COLOR.test(candidate.primaryForeground ?? "")
        ? candidate.primaryForeground!
        : DEFAULT_UI_THEME.primaryForeground,
      sectionAccent: HEX_COLOR.test(candidate.sectionAccent ?? "")
        ? candidate.sectionAccent!
        : DEFAULT_UI_THEME.sectionAccent,
      background: HEX_COLOR.test(candidate.background ?? "")
        ? candidate.background!
        : DEFAULT_UI_THEME.background,
      sidebar: HEX_COLOR.test(candidate.sidebar ?? "")
        ? candidate.sidebar!
        : DEFAULT_UI_THEME.sidebar,
      text: HEX_COLOR.test(candidate.text ?? "")
        ? candidate.text!
        : DEFAULT_UI_THEME.text,
      headingText: HEX_COLOR.test(candidate.headingText ?? "")
        ? candidate.headingText!
        : DEFAULT_UI_THEME.headingText,
      sidebarText: HEX_COLOR.test(candidate.sidebarText ?? "")
        ? candidate.sidebarText!
        : DEFAULT_UI_THEME.sidebarText,
    };
  } catch {
    return DEFAULT_UI_THEME;
  }
}

export function applyUiTheme(theme: UiTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--primary-foreground", theme.primaryForeground);
  root.style.setProperty("--sidebar-primary-foreground", theme.primaryForeground);
  root.style.setProperty("--ring", theme.primary);
  root.style.setProperty("--sidebar-primary", theme.primary);
  root.style.setProperty("--section-accent", theme.sectionAccent);
  root.style.setProperty("--background", theme.background);
  root.style.setProperty("--sidebar", theme.sidebar);
  root.style.setProperty("--foreground", theme.text);
  root.style.setProperty("--card-foreground", theme.text);
  root.style.setProperty("--popover-foreground", theme.text);
  root.style.setProperty("--heading-foreground", theme.headingText);
  root.style.setProperty("--sidebar-foreground", theme.sidebarText);
}
