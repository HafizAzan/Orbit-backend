import { AppUiTheme } from '../enum/app-ui-theme.enum';
import { ProjectTheme } from '../enum/project.enum';

const LEGACY_THEME_ALIASES: Record<string, string> = {
  ocean: 'teal',
  sunset: 'amber',
  midnight: 'dark',
  forest: 'classic',
  royal: 'classic',
};

function normalizeThemeValue<T extends string>(
  theme: string | null | undefined,
  values: readonly T[],
  fallback: T,
): T {
  if (!theme) return fallback;

  const normalized = LEGACY_THEME_ALIASES[theme] ?? theme;
  if (values.includes(normalized as T)) {
    return normalized as T;
  }

  return fallback;
}

export function normalizeProjectTheme(
  theme: string | null | undefined,
): ProjectTheme {
  return normalizeThemeValue(
    theme,
    Object.values(ProjectTheme),
    ProjectTheme.CLASSIC,
  );
}

export function normalizeAppUiTheme(
  theme: string | null | undefined,
): AppUiTheme {
  return normalizeThemeValue(theme, Object.values(AppUiTheme), AppUiTheme.CLASSIC);
}

export function isDarkAppUiTheme(theme: AppUiTheme) {
  return (
    theme === AppUiTheme.DARK ||
    theme === AppUiTheme.ONYX ||
    theme === AppUiTheme.NAVY
  );
}
