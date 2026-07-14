import { ProjectTheme } from '../../enum/project.enum';
import { normalizeProjectTheme } from '../theme-normalize.util';

export type ProjectThemeMeta = {
  id: ProjectTheme;
  label: string;
  description: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  headerFrom: string;
  headerTo: string;
  cardBorder: string;
  pillBg: string;
  iconBg: string;
  iconColor: string;
  previewGradient: string;
  mode: 'light' | 'dark';
};

export const PROJECT_THEME_META: Record<ProjectTheme, ProjectThemeMeta> = {
  [ProjectTheme.CLASSIC]: {
    id: ProjectTheme.CLASSIC,
    label: 'Classic',
    description: 'Clean indigo accents — the default Orbit look.',
    accent: '#6366f1',
    accentSoft: 'bg-indigo-50',
    accentText: 'text-indigo-600',
    headerFrom: 'from-indigo-500',
    headerTo: 'to-violet-500',
    cardBorder: 'border-indigo-100',
    pillBg: 'bg-indigo-50 text-indigo-700',
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    previewGradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    mode: 'light',
  },
  [ProjectTheme.TEAL]: {
    id: ProjectTheme.TEAL,
    label: 'Teal',
    description: 'Calm teal accents for focused delivery work.',
    accent: '#0d9488',
    accentSoft: 'bg-teal-50',
    accentText: 'text-teal-600',
    headerFrom: 'from-teal-500',
    headerTo: 'to-cyan-600',
    cardBorder: 'border-teal-100',
    pillBg: 'bg-teal-50 text-teal-700',
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-600',
    previewGradient: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
    mode: 'light',
  },
  [ProjectTheme.AMBER]: {
    id: ProjectTheme.AMBER,
    label: 'Amber',
    description: 'Warm amber glow for energetic teams.',
    accent: '#d97706',
    accentSoft: 'bg-amber-50',
    accentText: 'text-amber-600',
    headerFrom: 'from-amber-400',
    headerTo: 'to-orange-500',
    cardBorder: 'border-amber-100',
    pillBg: 'bg-amber-50 text-amber-700',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    previewGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    mode: 'light',
  },
  [ProjectTheme.DARK]: {
    id: ProjectTheme.DARK,
    label: 'Dark',
    description: 'Slate and indigo night sky for sleek dashboards.',
    accent: '#4338ca',
    accentSoft: 'bg-slate-100',
    accentText: 'text-indigo-700',
    headerFrom: 'from-slate-700',
    headerTo: 'to-indigo-800',
    cardBorder: 'border-slate-200',
    pillBg: 'bg-slate-100 text-slate-700',
    iconBg: 'bg-slate-100',
    iconColor: 'text-indigo-700',
    previewGradient: 'linear-gradient(135deg, #475569 0%, #3730a3 100%)',
    mode: 'dark',
  },
  [ProjectTheme.ONYX]: {
    id: ProjectTheme.ONYX,
    label: 'Onyx',
    description: 'Charcoal tones with a cool cyan edge.',
    accent: '#06b6d4',
    accentSoft: 'bg-zinc-100',
    accentText: 'text-cyan-700',
    headerFrom: 'from-zinc-700',
    headerTo: 'to-zinc-900',
    cardBorder: 'border-zinc-200',
    pillBg: 'bg-zinc-100 text-zinc-700',
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-700',
    previewGradient: 'linear-gradient(135deg, #3f3f46 0%, #09090b 100%)',
    mode: 'dark',
  },
  [ProjectTheme.NAVY]: {
    id: ProjectTheme.NAVY,
    label: 'Navy',
    description: 'Deep blue palette for low-light focus.',
    accent: '#2563eb',
    accentSoft: 'bg-blue-50',
    accentText: 'text-blue-700',
    headerFrom: 'from-blue-900',
    headerTo: 'to-slate-900',
    cardBorder: 'border-blue-200',
    pillBg: 'bg-blue-50 text-blue-700',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-700',
    previewGradient: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)',
    mode: 'dark',
  },
};

export function getProjectThemeMeta(
  theme: ProjectTheme | string,
): ProjectThemeMeta {
  return PROJECT_THEME_META[normalizeProjectTheme(theme)];
}
