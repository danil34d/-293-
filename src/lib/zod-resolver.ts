import type { ZodTypeAny, ZodIssue } from 'zod';

function setNested(target: Record<string, any>, path: Array<string | number>, value: any): void {
  if (path.length === 0) {
    return;
  }

  let current: Record<string, any> = target;

  for (let i = 0; i < path.length - 1; i += 1) {
    const key = String(path[i]);
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }

  const leafKey = String(path[path.length - 1]);
  if (!current[leafKey]) {
    current[leafKey] = value;
  }
}

function issuePathToArray(issue: ZodIssue): Array<string | number> {
  if (!issue.path || issue.path.length === 0) {
    return ['root'];
  }

  return issue.path.map((segment) => (typeof segment === 'number' ? segment : String(segment)));
}

export function zodResolver<TSchema extends ZodTypeAny>(schema: TSchema) {
  return async (values: unknown) => {
    const result = await schema.safeParseAsync(values);

    if (result.success) {
      return {
        values: result.data,
        errors: {},
      };
    }

    const errors: Record<string, any> = {};

    for (const issue of result.error.issues) {
      const path = issuePathToArray(issue);
      setNested(errors, path, {
        type: issue.code,
        message: issue.message,
      });
    }

    return {
      values: {},
      errors,
    };
  };
}
