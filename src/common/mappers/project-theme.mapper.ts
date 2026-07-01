import { ProjectTheme } from '../../enum/project.enum';

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
};

export const PROJECT_THEME_META: Record<ProjectTheme, ProjectThemeMeta> = {
  [ProjectTheme.CLASSIC]: {
    id: ProjectTheme.CLASSIC,
    label: 'Classic',
    description: 'Clean indigo accents — the default FlowSync look.',
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
  },
  [ProjectTheme.OCEAN]: {
    id: ProjectTheme.OCEAN,
    label: 'Ocean',
    description: 'Deep teal and aqua tones inspired by open water.',
    accent: '#0891b2',
    accentSoft: 'bg-cyan-50',
    accentText: 'text-cyan-600',
    headerFrom: 'from-cyan-500',
    headerTo: 'to-blue-600',
    cardBorder: 'border-cyan-100',
    pillBg: 'bg-cyan-50 text-cyan-700',
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    previewGradient: 'linear-gradient(135deg, #06b6d4 0%, #2563eb 100%)',
  },
  [ProjectTheme.SUNSET]: {
    id: ProjectTheme.SUNSET,
    label: 'Sunset',
    description: 'Warm coral and amber glow for energetic teams.',
    accent: '#ea580c',
    accentSoft: 'bg-orange-50',
    accentText: 'text-orange-600',
    headerFrom: 'from-orange-400',
    headerTo: 'to-rose-500',
    cardBorder: 'border-orange-100',
    pillBg: 'bg-orange-50 text-orange-700',
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-600',
    previewGradient: 'linear-gradient(135deg, #fb923c 0%, #f43f5e 100%)',
  },
  [ProjectTheme.FOREST]: {
    id: ProjectTheme.FOREST,
    label: 'Forest',
    description: 'Fresh emerald greens for calm, focused delivery.',
    accent: '#059669',
    accentSoft: 'bg-emerald-50',
    accentText: 'text-emerald-600',
    headerFrom: 'from-emerald-500',
    headerTo: 'to-teal-600',
    cardBorder: 'border-emerald-100',
    pillBg: 'bg-emerald-50 text-emerald-700',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    previewGradient: 'linear-gradient(135deg, #10b981 0%, #0d9488 100%)',
  },
  [ProjectTheme.ROYAL]: {
    id: ProjectTheme.ROYAL,
    label: 'Royal',
    description: 'Rich violet and fuchsia for premium project spaces.',
    accent: '#9333ea',
    accentSoft: 'bg-fuchsia-50',
    accentText: 'text-fuchsia-600',
    headerFrom: 'from-fuchsia-500',
    headerTo: 'to-purple-600',
    cardBorder: 'border-fuchsia-100',
    pillBg: 'bg-fuchsia-50 text-fuchsia-700',
    iconBg: 'bg-fuchsia-50',
    iconColor: 'text-fuchsia-600',
    previewGradient: 'linear-gradient(135deg, #d946ef 0%, #9333ea 100%)',
  },
  [ProjectTheme.MIDNIGHT]: {
    id: ProjectTheme.MIDNIGHT,
    label: 'Midnight',
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
  },
};

export function getProjectThemeMeta(theme: ProjectTheme): ProjectThemeMeta {
  return PROJECT_THEME_META[theme] ?? PROJECT_THEME_META[ProjectTheme.CLASSIC];
}

export function listProjectThemes(): ProjectThemeMeta[] {
  return Object.values(PROJECT_THEME_META);
}
