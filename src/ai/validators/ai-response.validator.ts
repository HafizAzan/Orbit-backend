import { BadRequestException } from '@nestjs/common';
import {
  ProjectCategory,
  ProjectPriority,
  ProjectVisibility,
} from '../../enum/project.enum';
import { TaskPriority, TaskStatus } from '../../enum/task.enum';
import type {
  AiAcceptanceCriteriaDraft,
  AiActivityDescribeDraft,
  AiAskWorkspaceDraft,
  AiCalendarDraft,
  AiMembershipImpactDraft,
  AiProjectFormDraft,
  AiProjectSummaryDraft,
  AiTaskFormDraft,
  AiTaskTipDraft,
  AiWorkBreakdownDraft,
} from '../interfaces/ai.types';

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('AI response must be a JSON object.');
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(
      `AI response field "${field}" must be a non-empty string.`,
    );
  }

  return value.trim();
}

function asStringArray(value: unknown, field: string, min = 0): string[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException(
      `AI response field "${field}" must be an array.`,
    );
  }

  const items = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);

  if (items.length < min) {
    throw new BadRequestException(
      `AI response field "${field}" must include at least ${min} item(s).`,
    );
  }

  return items;
}

function asNullableNumber(value: unknown, field: string): number | null {
  if (value == null || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new BadRequestException(
      `AI response field "${field}" must be a number.`,
    );
  }

  return Math.round(parsed);
}

function asPriority(value: unknown): TaskPriority {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  if (
    normalized === TaskPriority.CRITICAL ||
    normalized === TaskPriority.HIGH ||
    normalized === TaskPriority.MEDIUM ||
    normalized === TaskPriority.LOW
  ) {
    return normalized;
  }

  return TaskPriority.MEDIUM;
}

function asRiskLevel(value: unknown): 'low' | 'medium' | 'high' {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  if (
    normalized === 'low' ||
    normalized === 'medium' ||
    normalized === 'high'
  ) {
    return normalized;
  }

  return 'medium';
}

function clampScore(value: number | null) {
  if (value == null) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function sanitizeJsonCandidate(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
}

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(sanitizeJsonCandidate(raw));
  } catch {
    return null;
  }
}

function extractBalancedObject(raw: string): string | null {
  const start = raw.indexOf('{');

  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }

  return null;
}

export function extractJsonPayload(rawText: string): unknown {
  const trimmed = rawText.trim();

  const direct = tryParseJson(trimmed);
  if (direct !== null) {
    return direct;
  }

  const fencedMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (const match of fencedMatches) {
    const fenced = match[1]?.trim();
    if (!fenced) {
      continue;
    }

    const parsedFenced = tryParseJson(fenced);
    if (parsedFenced !== null) {
      return parsedFenced;
    }

    const nested = extractBalancedObject(fenced);
    if (nested) {
      const parsedNested = tryParseJson(nested);
      if (parsedNested !== null) {
        return parsedNested;
      }
    }
  }

  const balanced = extractBalancedObject(trimmed);
  if (balanced) {
    const parsedBalanced = tryParseJson(balanced);
    if (parsedBalanced !== null) {
      return parsedBalanced;
    }
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const sliced = tryParseJson(trimmed.slice(start, end + 1));
    if (sliced !== null) {
      return sliced;
    }
  }

  throw new BadRequestException('AI response was not valid JSON.');
}

export function validateWorkBreakdown(payload: unknown): AiWorkBreakdownDraft {
  const root = asObject(payload);
  const storiesRaw = root.stories;

  if (!Array.isArray(storiesRaw) || storiesRaw.length === 0) {
    throw new BadRequestException(
      'AI work breakdown must include at least one story.',
    );
  }

  const stories = storiesRaw.map((storyValue, storyIndex) => {
    const story = asObject(storyValue);
    const tasksRaw = story.tasks;

    if (!Array.isArray(tasksRaw) || tasksRaw.length === 0) {
      throw new BadRequestException(
        `AI story at index ${storyIndex} must include at least one task.`,
      );
    }

    return {
      title: asString(story.title, `stories[${storyIndex}].title`),
      description: asString(
        story.description,
        `stories[${storyIndex}].description`,
      ),
      storyPoints: asNullableNumber(
        story.storyPoints,
        `stories[${storyIndex}].storyPoints`,
      ),
      tasks: tasksRaw.map((taskValue, taskIndex) => {
        const task = asObject(taskValue);

        return {
          title: asString(
            task.title,
            `stories[${storyIndex}].tasks[${taskIndex}].title`,
          ),
          description: asString(
            task.description,
            `stories[${storyIndex}].tasks[${taskIndex}].description`,
          ),
          priority: asPriority(task.priority),
          estimatedHours: asNullableNumber(
            task.estimatedHours,
            `stories[${storyIndex}].tasks[${taskIndex}].estimatedHours`,
          ),
          labels: asStringArray(
            task.labels ?? [],
            `stories[${storyIndex}].tasks[${taskIndex}].labels`,
          ),
          acceptanceCriteria: asStringArray(
            task.acceptanceCriteria ?? [],
            `stories[${storyIndex}].tasks[${taskIndex}].acceptanceCriteria`,
          ),
          definitionOfDone: asStringArray(
            task.definitionOfDone ?? [],
            `stories[${storyIndex}].tasks[${taskIndex}].definitionOfDone`,
          ),
        };
      }),
    };
  });

  return {
    epicTitle: asString(root.epicTitle, 'epicTitle'),
    epicSummary: asString(root.epicSummary, 'epicSummary'),
    stories,
  };
}

export function validateAcceptanceCriteria(
  payload: unknown,
): AiAcceptanceCriteriaDraft {
  const root = asObject(payload);

  return {
    acceptanceCriteria: asStringArray(
      root.acceptanceCriteria,
      'acceptanceCriteria',
      1,
    ),
    definitionOfDone: asStringArray(
      root.definitionOfDone,
      'definitionOfDone',
      1,
    ),
    suggestedLabels: asStringArray(
      root.suggestedLabels ?? [],
      'suggestedLabels',
    ),
    suggestedPriority: asPriority(root.suggestedPriority),
    estimatedHours: asNullableNumber(root.estimatedHours, 'estimatedHours'),
  };
}

export function validateProjectSummary(
  payload: unknown,
): AiProjectSummaryDraft {
  const root = asObject(payload);

  return {
    executiveSummary: asString(root.executiveSummary, 'executiveSummary'),
    healthScore: clampScore(asNullableNumber(root.healthScore, 'healthScore')),
    confidence: clampScore(asNullableNumber(root.confidence, 'confidence')),
    riskLevel: asRiskLevel(root.riskLevel),
    completedHighlights: asStringArray(
      root.completedHighlights ?? [],
      'completedHighlights',
    ),
    delayedItems: asStringArray(root.delayedItems ?? [], 'delayedItems'),
    risks: asStringArray(root.risks ?? [], 'risks'),
    recommendedNextActions: asStringArray(
      root.recommendedNextActions ?? [],
      'recommendedNextActions',
    ),
  };
}

function asCategory(value: unknown): AiProjectFormDraft['category'] {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  if (
    normalized === ProjectCategory.MARKETING ||
    normalized === ProjectCategory.ENGINEERING ||
    normalized === ProjectCategory.DESIGN ||
    normalized === ProjectCategory.PRODUCT ||
    normalized === ProjectCategory.OPERATIONS
  ) {
    return normalized;
  }

  return ProjectCategory.PRODUCT;
}

function asProjectPriority(value: unknown): AiProjectFormDraft['priority'] {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  if (
    normalized === ProjectPriority.HIGH ||
    normalized === ProjectPriority.MEDIUM ||
    normalized === ProjectPriority.LOW
  ) {
    return normalized;
  }

  return ProjectPriority.MEDIUM;
}

function asOptionalDate(value: unknown, field: string): string {
  if (value == null || value === '') {
    return '';
  }

  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new BadRequestException(
      `AI response field "${field}" must be YYYY-MM-DD.`,
    );
  }

  return raw;
}

function asOptionalUuid(value: unknown, field: string): string | null {
  if (value == null || value === '') {
    return null;
  }

  const raw = String(value).trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      raw,
    )
  ) {
    throw new BadRequestException(
      `AI response field "${field}" must be a UUID.`,
    );
  }

  return raw;
}

export function validateProjectFormDraft(payload: unknown): AiProjectFormDraft {
  const root = asObject(payload);
  const memberIdsRaw = root.memberIds;

  if (memberIdsRaw != null && !Array.isArray(memberIdsRaw)) {
    throw new BadRequestException(
      'AI response field "memberIds" must be an array.',
    );
  }

  const memberIds = (memberIdsRaw ?? [])
    .map((item, index) => asOptionalUuid(item, `memberIds[${index}]`))
    .filter((item): item is string => Boolean(item));

  const key = asString(root.key, 'key')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);

  if (key.length < 2) {
    throw new BadRequestException(
      'AI response field "key" must be at least 2 characters.',
    );
  }

  return {
    name: asString(root.name, 'name'),
    key,
    description: asString(root.description, 'description'),
    category: asCategory(root.category),
    priority: asProjectPriority(root.priority),
    startDate: asOptionalDate(root.startDate, 'startDate'),
    dueDate: asOptionalDate(root.dueDate, 'dueDate'),
    visibility: ProjectVisibility.PRIVATE,
    leadUserId: asOptionalUuid(root.leadUserId, 'leadUserId'),
    memberIds: [...new Set(memberIds)],
  };
}

function asTaskStatus(value: unknown): AiTaskFormDraft['status'] {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  if (
    normalized === TaskStatus.TODO ||
    normalized === TaskStatus.IN_PROGRESS ||
    normalized === TaskStatus.REVIEW ||
    normalized === TaskStatus.DONE
  ) {
    return normalized;
  }

  return TaskStatus.TODO;
}

function asTaskPriority(value: unknown): AiTaskFormDraft['priority'] {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  if (
    normalized === TaskPriority.CRITICAL ||
    normalized === TaskPriority.HIGH ||
    normalized === TaskPriority.MEDIUM ||
    normalized === TaskPriority.LOW
  ) {
    return normalized;
  }

  return TaskPriority.MEDIUM;
}

export function validateTaskFormDraft(payload: unknown): AiTaskFormDraft {
  const root = asObject(payload);

  return {
    title: asString(root.title, 'title'),
    description: asString(root.description, 'description'),
    status: asTaskStatus(root.status),
    priority: asTaskPriority(root.priority),
    estimatedHours: asNullableNumber(root.estimatedHours, 'estimatedHours'),
    assigneeId: asOptionalUuid(root.assigneeId, 'assigneeId'),
    dueDate: asOptionalDate(root.dueDate, 'dueDate'),
    labels: asStringArray(root.labels ?? [], 'labels'),
  };
}

export function validateActivityDescribe(
  payload: unknown,
): AiActivityDescribeDraft {
  const root = asObject(payload);

  return {
    headline: asString(root.headline, 'headline'),
    explanation: asString(root.explanation, 'explanation'),
    impact: asString(root.impact, 'impact'),
    suggestedFollowUp: asString(root.suggestedFollowUp, 'suggestedFollowUp'),
  };
}

export function validateTaskTip(payload: unknown): AiTaskTipDraft {
  const root = asObject(payload);

  return {
    reason: asString(root.reason, 'reason'),
    nextStep: asString(root.nextStep, 'nextStep'),
  };
}

export function validateMembershipImpact(
  payload: unknown,
): AiMembershipImpactDraft {
  const root = asObject(payload);

  return {
    headline: asString(root.headline, 'headline'),
    impact: asString(root.impact, 'impact'),
    caution: asString(root.caution, 'caution'),
  };
}

export function validateCalendarDraft(payload: unknown): AiCalendarDraft {
  const root = asObject(payload);
  const typeRaw = String(root.type ?? '')
    .trim()
    .toLowerCase();
  const type = typeRaw === 'deadline' ? 'deadline' : 'team';

  return {
    title: asString(root.title, 'title'),
    type,
    description: asString(root.description, 'description'),
  };
}

export function validateAskWorkspace(payload: unknown): AiAskWorkspaceDraft {
  const root = asObject(payload);
  const confidenceRaw = String(root.confidence ?? '')
    .trim()
    .toLowerCase();
  const confidence =
    confidenceRaw === 'high' || confidenceRaw === 'medium'
      ? confidenceRaw
      : 'low';

  return {
    answer: asString(root.answer, 'answer'),
    confidence,
    sources: asStringArray(root.sources ?? [], 'sources'),
  };
}
