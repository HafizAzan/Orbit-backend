export type PromptTemplateInput = {
  variables?: Record<string, string | number | boolean | null | undefined>;
  language?: string;
  workspaceName?: string;
  projectName?: string;
  role?: string;
};

function applyVariables(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return variables[key] ?? '';
  });
}

export function buildPrompt(
  template: string,
  input: PromptTemplateInput = {},
): string {
  const variables: Record<string, string> = {
    language: input.language ?? 'English',
    workspaceName: input.workspaceName ?? 'Workspace',
    projectName: input.projectName ?? 'Project',
    role: input.role ?? 'manager',
  };

  for (const [key, value] of Object.entries(input.variables ?? {})) {
    variables[key] = value == null ? '' : String(value);
  }

  return applyVariables(template, variables).trim();
}
