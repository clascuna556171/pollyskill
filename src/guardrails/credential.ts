/**
 * PolySkill Credential & PII Leak Guardrail Engine
 * 
 * Enforces deterministic defense against:
 * 1. Ingress Credential Exfiltration: Prevents agents from passing raw API keys, private keys, or tokens in tool arguments
 * 2. Egress Credential Leakage: Auto-redacts credentials, private keys, and PII from tool outputs before reaching LLM context
 */

export interface CredentialValidationResult {
  blocked: boolean;
  reason?: string;
  matchedType?: string;
}

export class CredentialGuardrail {
  private static readonly SECRET_PATTERNS: Array<{ type: string; regex: RegExp }> = [
    // AWS Access Key ID
    { type: 'AWS_ACCESS_KEY', regex: /\bAKIA[0-9A-Z]{16}\b/ },
    // GitHub Personal Access Token (classic & fine-grained)
    { type: 'GITHUB_TOKEN', regex: /\b(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})\b/ },
    // OpenAI API Key
    { type: 'OPENAI_API_KEY', regex: /\bsk-[a-zA-Z0-9]{20,}\b/ },
    // Anthropic API Key
    { type: 'ANTHROPIC_API_KEY', regex: /\bsk-ant-[a-zA-Z0-9]{20,}\b/ },
    // Slack OAuth & Bot Token
    { type: 'SLACK_TOKEN', regex: /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/ },
    // RSA / EC / OpenSSH Private Keys
    { type: 'PRIVATE_KEY', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
    // Generic Bearer JWT
    { type: 'JWT_BEARER', regex: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/ },
    // High-Risk PII: Social Security Number
    { type: 'PII_SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/ },
    // High-Risk PII: Primary Credit Card Numbers
    { type: 'PII_CREDIT_CARD', regex: /\b(?:\d{4}[- ]){3}\d{4}\b|\b\d{4}[- ]\d{6}[- ]\d{5}\b/ }
  ];

  /**
   * Evaluates tool input arguments to detect unauthorized raw credential injection.
   */
  static evaluateInput(input: unknown): CredentialValidationResult {
    if (input === null || input === undefined) {
      return { blocked: false };
    }

    if (typeof input === 'string') {
      for (const { type, regex } of this.SECRET_PATTERNS) {
        if (regex.test(input)) {
          return {
            blocked: true,
            reason: `Raw sensitive credential or PII pattern detected (${type}) in input argument`,
            matchedType: type
          };
        }
      }
      return { blocked: false };
    }

    if (Array.isArray(input)) {
      for (const item of input) {
        const res = this.evaluateInput(item);
        if (res.blocked) return res;
      }
      return { blocked: false };
    }

    if (typeof input === 'object') {
      for (const val of Object.values(input as Record<string, unknown>)) {
        const res = this.evaluateInput(val);
        if (res.blocked) return res;
      }
      return { blocked: false };
    }

    return { blocked: false };
  }

  /**
   * Scans a string and redacts all recognized sensitive credentials.
   */
  static redactString(str: string): string {
    let result = str;

    // AWS Access Key
    result = result.replace(/\b(AKIA)[0-9A-Z]{12}([0-9A-Z]{4})\b/g, '$1••••••••$2[REDACTED_AWS_KEY]');
    result = result.replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]');

    // GitHub PAT
    result = result.replace(/\bghp_[a-zA-Z0-9]{36}\b/g, '[REDACTED_GITHUB_TOKEN]');
    result = result.replace(/\bgithub_pat_[a-zA-Z0-9_]{82}\b/g, '[REDACTED_GITHUB_PAT]');

    // OpenAI Key
    result = result.replace(/\bsk-[a-zA-Z0-9]{20,}\b/g, '[REDACTED_OPENAI_KEY]');

    // Anthropic Key
    result = result.replace(/\bsk-ant-[a-zA-Z0-9]{20,}\b/g, '[REDACTED_ANTHROPIC_KEY]');

    // Slack Token
    result = result.replace(/\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/g, '[REDACTED_SLACK_TOKEN]');

    // Private Keys
    result = result.replace(/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');
    result = result.replace(/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');

    // JWT Bearer
    result = result.replace(/\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, '[REDACTED_JWT_TOKEN]');

    // SSN
    result = result.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '•••-••-[REDACTED_SSN]');

    // Credit Card
    result = result.replace(/\b(?:\d{4}[- ]){3}\d{4}\b|\b\d{4}[- ]\d{6}[- ]\d{5}\b/g, '••••-••••-••••-[REDACTED_CARD]');

    return result;
  }

  /**
   * Recursively sanitizes and redacts credentials from any output data structure.
   */
  static redactOutput<T>(output: T): T {
    if (output === null || output === undefined) {
      return output;
    }

    if (typeof output === 'string') {
      return this.redactString(output) as unknown as T;
    }

    if (Array.isArray(output)) {
      return output.map(item => this.redactOutput(item)) as unknown as T;
    }

    if (typeof output === 'object') {
      const copy: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(output as Record<string, unknown>)) {
        copy[key] = this.redactOutput(val);
      }
      return copy as unknown as T;
    }

    return output;
  }

  /**
   * Generates a self-contained runtime snippet for standalone MCP servers & runners.
   */
  static generateStandaloneCredentialGuardCode(): string {
    return `
  // Credential & Secret Ingress Guard
  const credentialPatterns = [
    /\\bAKIA[0-9A-Z]{16}\\b/,
    /\\b(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})\\b/,
    /\\bsk-[a-zA-Z0-9]{20,}\\b/,
    /\\bsk-ant-[a-zA-Z0-9]{20,}\\b/,
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    /\\beyJ[a-zA-Z0-9_-]{10,}\\.eyJ[a-zA-Z0-9_-]{10,}\\.[a-zA-Z0-9_-]{10,}\\b/
  ];

  for (const [key, value] of Object.entries(args || {})) {
    if (typeof value === 'string') {
      for (const pattern of credentialPatterns) {
        if (pattern.test(value)) {
          throw new Error(\`[GUARDRAIL_VIOLATION] Argument '\${key}' contains unauthorized raw credential or secret pattern.\`);
        }
      }
    }
  }
`.trim();
  }

  /**
   * Generates a standalone redaction helper for tool output.
   */
  static generateStandaloneOutputRedactionCode(): string {
    return `
function redactSecrets(data) {
  if (typeof data === 'string') {
    return data
      .replace(/\\bAKIA[0-9A-Z]{16}\\b/g, '[REDACTED_AWS_KEY]')
      .replace(/\\b(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})\\b/g, '[REDACTED_GITHUB_TOKEN]')
      .replace(/\\bsk-[a-zA-Z0-9]{20,}\\b/g, '[REDACTED_OPENAI_KEY]')
      .replace(/\\bsk-ant-[a-zA-Z0-9]{20,}\\b/g, '[REDACTED_ANTHROPIC_KEY]')
      .replace(/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\\s\\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
      .replace(/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
      .replace(/\\beyJ[a-zA-Z0-9_-]{10,}\\.eyJ[a-zA-Z0-9_-]{10,}\\.[a-zA-Z0-9_-]{10,}\\b/g, '[REDACTED_JWT]');
  }
  if (Array.isArray(data)) return data.map(redactSecrets);
  if (data && typeof data === 'object') {
    const copy = {};
    for (const [k, v] of Object.entries(data)) copy[k] = redactSecrets(v);
    return copy;
  }
  return data;
}
`.trim();
  }
}
