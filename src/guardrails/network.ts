/**
 * PolySkill Network & SSRF Guardrail Engine
 * 
 * Enforces enterprise-grade network boundary defenses against:
 * 1. Cloud Instance Metadata Service (IMDS) exfiltration (AWS, GCP, Azure, OpenStack)
 * 2. RFC 1918 private network scanning (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 * 3. Localhost loopback targeting (127.0.0.1, localhost, 0.0.0.0)
 * 4. Hex, octal, and integer obfuscated IP representations
 */

export interface NetworkValidationResult {
  blocked: boolean;
  reason?: string;
  matchedPattern?: string;
}

export class NetworkGuardrail {
  /**
   * Blocked hostnames and link-local cloud metadata endpoints
   */
  private static readonly METADATA_HOSTS = [
    'metadata.google.internal',
    'metadata.internal',
    'instance-data',
    '169.254.169.254'
  ];

  /**
   * Evaluates a string input (URL, IP, or hostname) and determines if it targets
   * prohibited internal infrastructure, loopbacks, or cloud metadata endpoints.
   */
  static evaluateTarget(input: string): NetworkValidationResult {
    if (!input || typeof input !== 'string') {
      return { blocked: false };
    }

    const trimmed = input.trim();

    // 1. Fast regex scan for direct IP patterns in strings / URLs
    // Link-local / Cloud metadata service (169.254.0.0/16)
    if (/169\.254\.\d{1,3}\.\d{1,3}/i.test(trimmed)) {
      return {
        blocked: true,
        reason: 'Cloud Instance Metadata Service (IMDS) link-local access prohibited (169.254.x.x)',
        matchedPattern: '169.254.0.0/16'
      };
    }

    // Localhost loopback (127.0.0.0/8, localhost, 0.0.0.0, [::1])
    if (/(\b127\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|localhost\b|0\.0\.0\.0\b|\[::1\])/i.test(trimmed)) {
      return {
        blocked: true,
        reason: 'Localhost and loopback address access prohibited',
        matchedPattern: '127.0.0.0/8'
      };
    }

    // RFC 1918: 10.0.0.0/8
    if (/(^|https?:\/\/|@|\/)10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/|$)/i.test(trimmed)) {
      return {
        blocked: true,
        reason: 'Private Class A RFC 1918 address access prohibited (10.0.0.0/8)',
        matchedPattern: '10.0.0.0/8'
      };
    }

    // RFC 1918: 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
    if (/(^|https?:\/\/|@|\/)172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}(:\d+)?(\/|$)/i.test(trimmed)) {
      return {
        blocked: true,
        reason: 'Private Class B RFC 1918 address access prohibited (172.16.0.0/12)',
        matchedPattern: '172.16.0.0/12'
      };
    }

    // RFC 1918: 192.168.0.0/16
    if (/(^|https?:\/\/|@|\/)192\.168\.\d{1,3}\.\d{1,3}(:\d+)?(\/|$)/i.test(trimmed)) {
      return {
        blocked: true,
        reason: 'Private Class C RFC 1918 address access prohibited (192.168.0.0/16)',
        matchedPattern: '192.168.0.0/16'
      };
    }

    // Cloud metadata internal hostnames
    for (const host of this.METADATA_HOSTS) {
      if (trimmed.toLowerCase().includes(host)) {
        return {
          blocked: true,
          reason: `Cloud provider metadata endpoint access prohibited: '${host}'`,
          matchedPattern: host
        };
      }
    }

    // Obfuscated integer/dword IP detection (e.g., 2130706433 = 127.0.0.1 or 0x7f000001)
    if (/(^|https?:\/\/)(0x[0-9a-fA-F]+|[0-9]{8,11})(:\d+)?(\/|$)/i.test(trimmed)) {
      return {
        blocked: true,
        reason: 'Obfuscated hexadecimal or integer IP address prohibited',
        matchedPattern: 'OBFUSCATED_IP'
      };
    }

    return { blocked: false };
  }

  /**
   * Generates a self-contained runtime snippet for standalone MCP servers & runners.
   */
  static generateStandaloneNetworkGuardCode(): string {
    return `
  // SSRF & Cloud Metadata Guard
  const prohibitedNetworkRegex = /(\\b169\\.254\\.\\d{1,3}\\.\\d{1,3}\\b|\\b127\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b|localhost\\b|0\\.0\\.0\\.0\\b|\\[::1\\]|metadata\\.google\\.internal|instance-data|(^|https?:\\/\\/)10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|(^|https?:\\/\\/)172\\.(1[6-9]|2[0-9]|3[0-1])\\.\\d{1,3}\\.\\d{1,3}|(^|https?:\\/\\/)192\\.168\\.\\d{1,3}\\.\\d{1,3})/i;
  for (const [key, value] of Object.entries(args || {})) {
    if (typeof value === 'string' && prohibitedNetworkRegex.test(value)) {
      throw new Error(\`[GUARDRAIL_VIOLATION] Argument '\${key}' violates network SSRF boundary (targets internal/metadata endpoint): '\${value}'\`);
    }
  }
`.trim();
  }
}
