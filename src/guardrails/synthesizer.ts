import { GuardrailPolicy, SkillTool, ToolRiskLevel } from '../ir/types.js';
import { SecurityAuditResult, SecurityFinding } from './types.js';

export const DEFAULT_GUARDRAIL_POLICY: GuardrailPolicy = {
  enablePathTraversalProtection: true,
  enableDestructiveConfirmation: true,
  enableDryRunDefault: true,
  defaultTimeoutSeconds: 30,
  blockedShellCommands: [
    'rm -rf',
    'rm -r /',
    'mkfs',
    ':(){ :|:& };:',
    'dd if=/dev/zero',
    'format c:',
    'del /s /q c:\\',
    'shutdown',
    'reboot',
    'drop database',
    'drop table',
    'truncate table',
  ],
  allowedFileExtensions: [
    '.json', '.yaml', '.yml', '.txt', '.csv', '.md', '.log',
    '.ts', '.js', '.py', '.sql', '.html', '.css'
  ],
  sanitizationRegexes: [
    { pattern: '\\.\\.[\\/\\\\]', reason: 'Path traversal sequence (../ or ..\\)' },
    { pattern: '([A-Za-z]:[\\\\/](Windows|System32))', reason: 'Access to system root directory' },
    { pattern: '((\\/etc|\\/root|\\/sys|\\/proc)[\\/\\s])', reason: 'Access to Linux core system paths' },
    { pattern: '(\\|\\s*bash|\\|\\s*sh)', reason: 'Piped shell execution injection' },
    { pattern: '(`.*`|\\$\\(.*\\))', reason: 'Command substitution injection' }
  ]
};

export class GuardrailSynthesizer {
  /**
   * Analyzes an array of tools and computes a deterministic security audit,
   * detecting destructive keywords, missing validation, and calculating a Safety Score (0-100).
   */
  static audit(tools: SkillTool[], customPolicy?: Partial<GuardrailPolicy>): SecurityAuditResult {
    const policy: GuardrailPolicy = {
      ...DEFAULT_GUARDRAIL_POLICY,
      ...customPolicy
    };

    const findings: SecurityFinding[] = [];
    let penalty = 0;

    const destructiveKeywords = ['delete', 'drop', 'remove', 'destroy', 'purge', 'truncate', 'terminate', 'kill'];
    const writeKeywords = ['create', 'insert', 'update', 'modify', 'write', 'post', 'patch', 'put'];

    for (const tool of tools) {
      const lowerName = tool.name.toLowerCase();
      const lowerDesc = tool.description.toLowerCase();
      const isDestructive = destructiveKeywords.some(kw => lowerName.includes(kw) || lowerDesc.includes(kw));
      const isWrite = writeKeywords.some(kw => lowerName.includes(kw) || lowerDesc.includes(kw));

      // Rule 1: Risk Level classification audit
      if (isDestructive && tool.riskLevel !== 'destructive_write' && tool.riskLevel !== 'privileged') {
        findings.push({
          severity: 'high',
          rule: 'MISCLASSIFIED_RISK_LEVEL',
          toolId: tool.id,
          message: `Tool '${tool.name}' appears destructive but is classified as '${tool.riskLevel}'.`,
          remediation: `Upgrade riskLevel to 'destructive_write' and enable requireConfirmation.`
        });
        penalty += 20;
      } else if (isWrite && tool.riskLevel === 'read_only') {
        findings.push({
          severity: 'medium',
          rule: 'MISCLASSIFIED_READONLY',
          toolId: tool.id,
          message: `Tool '${tool.name}' performs mutations but is marked as 'read_only'.`,
          remediation: `Update riskLevel to 'idempotent_write' or 'destructive_write'.`
        });
        penalty += 10;
      }

      // Rule 2: Guardrail check on destructive tools
      if (tool.riskLevel === 'destructive_write' || isDestructive) {
        if (!tool.guardrails?.requireConfirmation) {
          findings.push({
            severity: 'high',
            rule: 'MISSING_DESTRUCTIVE_CONFIRMATION',
            toolId: tool.id,
            message: `Destructive tool '${tool.name}' does not require explicit human confirmation.`,
            remediation: `Inject confirmation gate: requireConfirmation = true`
          });
          penalty += 15;
        }

        if (!tool.guardrails?.allowDryRun) {
          findings.push({
            severity: 'medium',
            rule: 'MISSING_DRY_RUN_MODE',
            toolId: tool.id,
            message: `Tool '${tool.name}' mutates state without dry-run simulation support.`,
            remediation: `Inject dryRun boolean parameter and handler simulation.`
          });
          penalty += 8;
        }
      }

      // Rule 3: File path parameters without path traversal guard
      for (const [propName, prop] of Object.entries(tool.parameters.properties)) {
        const lowerProp = propName.toLowerCase();
        if (lowerProp.includes('path') || lowerProp.includes('file') || lowerProp.includes('dir')) {
          if (!tool.guardrails?.restrictedPaths || tool.guardrails.restrictedPaths.length === 0) {
            findings.push({
              severity: 'medium',
              rule: 'UNCONSTRAINED_FILE_PATH_INPUT',
              toolId: tool.id,
              message: `Parameter '${propName}' accepts file paths without restricted sandbox boundaries.`,
              remediation: `Apply sanitizePath() wrapper restricting to current workspace directory.`
            });
            penalty += 10;
          }
        }
      }
    }

    const safetyScore = Math.max(0, 100 - penalty);
    return {
      safetyScore,
      passed: safetyScore >= 70 && !findings.some(f => f.severity === 'high'),
      findings,
      recommendedGuardrails: policy
    };
  }

  /**
   * Synthesizes and hardens tools by injecting missing guardrails, parameters,
   * and security wrappers deterministically.
   */
  static synthesize(tools: SkillTool[], policy: GuardrailPolicy = DEFAULT_GUARDRAIL_POLICY): SkillTool[] {
    return tools.map(tool => {
      const hardened = JSON.parse(JSON.stringify(tool)) as SkillTool;
      const lowerName = hardened.name.toLowerCase();
      const lowerDesc = hardened.description.toLowerCase();
      const isDestructive = ['delete', 'drop', 'remove', 'destroy', 'purge', 'truncate', 'terminate', 'kill']
        .some(kw => lowerName.includes(kw) || lowerDesc.includes(kw));

      hardened.guardrails = hardened.guardrails || {};
      hardened.guardrails.timeoutSeconds = hardened.guardrails.timeoutSeconds || policy.defaultTimeoutSeconds;

      if (isDestructive || hardened.riskLevel === 'destructive_write') {
        hardened.riskLevel = 'destructive_write';
        hardened.guardrails.requireConfirmation = policy.enableDestructiveConfirmation;
        hardened.guardrails.allowDryRun = policy.enableDryRunDefault;

        // Auto-inject dryRun boolean parameter if not already declared
        if (policy.enableDryRunDefault && !hardened.parameters.properties['dryRun']) {
          hardened.parameters.properties['dryRun'] = {
            type: 'boolean',
            description: 'When true, simulates the operation and returns planned mutations without modifying real state.',
            default: true
          };
        }

        // Auto-inject reason/confirmation text parameter
        if (policy.enableDestructiveConfirmation && !hardened.parameters.properties['confirm']) {
          hardened.parameters.properties['confirm'] = {
            type: 'boolean',
            description: 'Explicit confirmation flag required to execute destructive mutations.',
            default: false
          };
        }
      }

      // Check for path parameters and inject boundary checks
      for (const [propName] of Object.entries(hardened.parameters.properties)) {
        const lowerProp = propName.toLowerCase();
        if (lowerProp.includes('path') || lowerProp.includes('file') || lowerProp.includes('dir')) {
          hardened.guardrails.restrictedPaths = hardened.guardrails.restrictedPaths || ['./', '.'];
        }
      }

      return hardened;
    });
  }

  /**
   * Returns a standalone JavaScript validation helper function code string
   * that target generators (like the standalone MCP server) can embed into their code.
   */
  static generateStandaloneValidatorCode(): string {
    return `
/**
 * PolySkill Deterministic Runtime Guardrail Guard
 */
export function validateToolExecution(toolName, args, guardrails = {}) {
  // 1. Path traversal guard
  for (const [key, value] of Object.entries(args || {})) {
    if (typeof value === 'string') {
      if (/(\\.\\.[\\\\/]|(\\/etc|\\/root|\\/sys|\\/proc)[\\\\/\\s]|([A-Za-z]:[\\\\/](Windows|System32)))/i.test(value)) {
        throw new Error(\`[GUARDRAIL_VIOLATION] Argument '\${key}' contains prohibited path traversal sequence: '\${value}'\`);
      }
      if (/(\\|\\s*(bash|sh|cmd|powershell)|(\`.*\`|\\$\\(.*\\)))/i.test(value)) {
        throw new Error(\`[GUARDRAIL_VIOLATION] Argument '\${key}' contains command injection pattern: '\${value}'\`);
      }
    }
  }

  // 2. Destructive confirmation guard
  if (guardrails.requireConfirmation && args.confirm !== true) {
    if (args.dryRun !== true) {
      throw new Error(\`[CONFIRMATION_REQUIRED] Tool '\${toolName}' is destructive. You must pass { confirm: true } or { dryRun: true } to proceed.\`);
    }
  }

  return true;
}
`.trim();
  }
}
