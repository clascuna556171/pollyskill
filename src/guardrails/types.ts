import { GuardrailPolicy, SkillTool } from '../ir/types.js';

export interface SecurityFinding {
  severity: 'low' | 'medium' | 'high';
  rule: string;
  message: string;
  toolId?: string;
  remediation?: string;
}

export interface SecurityAuditResult {
  safetyScore: number; // 0 to 100
  passed: boolean;
  findings: SecurityFinding[];
  recommendedGuardrails: GuardrailPolicy;
}
