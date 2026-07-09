import { TaskPriority } from '../../enum/task.enum';

export type AiGeneratedTaskDraft = {
  title: string;
  description: string;
  priority: TaskPriority;
  estimatedHours: number | null;
  labels: string[];
  acceptanceCriteria: string[];
  definitionOfDone: string[];
};

export type AiGeneratedStoryDraft = {
  title: string;
  description: string;
  storyPoints: number | null;
  tasks: AiGeneratedTaskDraft[];
};

export type AiWorkBreakdownDraft = {
  epicTitle: string;
  epicSummary: string;
  stories: AiGeneratedStoryDraft[];
};

export type AiAcceptanceCriteriaDraft = {
  acceptanceCriteria: string[];
  definitionOfDone: string[];
  suggestedLabels: string[];
  suggestedPriority: TaskPriority | null;
  estimatedHours: number | null;
};

export type AiProjectSummaryDraft = {
  executiveSummary: string;
  healthScore: number;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  completedHighlights: string[];
  delayedItems: string[];
  risks: string[];
  recommendedNextActions: string[];
};

export type AiProjectFormDraft = {
  name: string;
  key: string;
  description: string;
  category: 'marketing' | 'engineering' | 'design' | 'product' | 'operations';
  priority: 'low' | 'medium' | 'high';
  startDate: string;
  dueDate: string;
  visibility: 'private' | 'public';
  leadUserId: string | null;
  memberIds: string[];
};

export type AiTaskFormDraft = {
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimatedHours: number | null;
  assigneeId: string | null;
  dueDate: string;
  labels: string[];
};

export type AiActivityDescribeDraft = {
  headline: string;
  explanation: string;
  impact: string;
  suggestedFollowUp: string;
};

export type AiTaskTipDraft = {
  reason: string;
  nextStep: string;
};

export type AiMembershipImpactDraft = {
  headline: string;
  impact: string;
  caution: string;
};

export type AiCalendarDraft = {
  title: string;
  type: 'team' | 'deadline';
  description: string;
};

export type AiAskWorkspaceDraft = {
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  sources: string[];
};

export type AiPromptContext = {
  workspaceName?: string;
  projectName?: string;
  projectKey?: string;
  role?: string;
  language?: string;
};
