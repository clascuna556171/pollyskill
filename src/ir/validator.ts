import { SkillIR } from './types.js';

export interface ValidationIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export class IRValidator {
  static validate(ir: unknown): { valid: boolean; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = [];

    if (!ir || typeof ir !== 'object') {
      return {
        valid: false,
        issues: [{ path: 'root', message: 'SkillIR must be a non-null object', severity: 'error' }]
      };
    }

    const candidate = ir as Partial<SkillIR>;

    if (!candidate.name || typeof candidate.name !== 'string') {
      issues.push({ path: 'name', message: 'Skill name is required and must be a string', severity: 'error' });
    } else if (!/^[a-z0-9_-]+$/i.test(candidate.name)) {
      issues.push({
        path: 'name',
        message: 'Skill name should only contain alphanumeric characters, underscores, or hyphens',
        severity: 'warning'
      });
    }

    if (!candidate.description || typeof candidate.description !== 'string') {
      issues.push({ path: 'description', message: 'Skill description is required', severity: 'error' });
    }

    if (!Array.isArray(candidate.tools)) {
      issues.push({ path: 'tools', message: 'Tools must be an array', severity: 'error' });
    } else {
      candidate.tools.forEach((tool, index) => {
        if (!tool.name) {
          issues.push({ path: `tools[${index}].name`, message: 'Tool name is required', severity: 'error' });
        }
        if (!tool.description) {
          issues.push({ path: `tools[${index}].description`, message: 'Tool description is required', severity: 'warning' });
        }
        if (!tool.parameters || typeof tool.parameters !== 'object') {
          issues.push({ path: `tools[${index}].parameters`, message: 'Tool parameters object is required', severity: 'error' });
        }
      });
    }

    const hasErrors = issues.some(i => i.severity === 'error');
    return {
      valid: !hasErrors,
      issues
    };
  }
}
