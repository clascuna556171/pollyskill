import { SkillIR, SkillTool, JSONSchemaProperty, ToolRiskLevel } from '../ir/types.js';
import { DEFAULT_GUARDRAIL_POLICY } from '../guardrails/synthesizer.js';

export class BashParser {
  /**
   * Statically parses Bash / POSIX shell scripts without executing untrusted code.
   * Extracts script descriptions, getopts flags, long options, and positional parameter definitions.
   */
  static parse(source: string, filename = 'script.sh'): SkillIR {
    const baseName = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    const lines = source.split('\n');

    // 1. Extract Header Description & Metadata from comments
    let description = '';
    const headerLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#!')) continue; // Skip shebang
      if (trimmed.startsWith('#')) {
        const commentBody = trimmed.replace(/^#\s?/, '');
        if (/^(description|summary):/i.test(commentBody)) {
          description = commentBody.replace(/^(description|summary):\s*/i, '').trim();
        } else {
          headerLines.push(commentBody);
        }
      } else if (trimmed.length > 0) {
        break; // Stop at first non-comment, non-empty code line
      }
    }

    if (!description && headerLines.length > 0) {
      description = headerLines.slice(0, 3).join(' ').trim();
    }
    if (!description) {
      description = `DevOps operational tool compiled from ${filename}`;
    }

    // 2. Extract Flags from `while/case` or `getopts`
    const properties: Record<string, JSONSchemaProperty> = {};
    const required: string[] = [];

    // Check for comment annotations: # @param <name> <type> <description>
    const paramAnnotationRegex = /#\s*@param\s+([a-zA-Z0-9_-]+)\s*(?:\{([a-zA-Z]+)\})?\s*(.*)/g;
    let annotMatch: RegExpExecArray | null;
    while ((annotMatch = paramAnnotationRegex.exec(source)) !== null) {
      const pName = annotMatch[1].replace(/^--?/, '');
      const pType = (annotMatch[2] || 'string').toLowerCase() as JSONSchemaProperty['type'];
      const pDesc = annotMatch[3] || `Parameter --${pName}`;
      properties[pName] = {
        type: pType === 'boolean' || pType === 'number' || pType === 'integer' ? pType : 'string',
        description: pDesc
      };
    }

    // Check for case statement options: --cluster-name | -c)
    const caseOptionRegex = /['"]?(--?[a-zA-Z0-9_-]+)(?:\|['"]?(--?[a-zA-Z0-9_-]+))?['"]?\s*\)\s*(?:([a-zA-Z0-9_]+)=)?/g;
    let caseMatch: RegExpExecArray | null;
    while ((caseMatch = caseOptionRegex.exec(source)) !== null) {
      const rawFlag = caseMatch[1];
      const optName = rawFlag.replace(/^--?/, '');
      if (['h', 'help'].includes(optName.toLowerCase())) continue;

      if (!properties[optName]) {
        // Lookahead to see if next token is shift 2 (value) or shift (boolean flag)
        const matchIndex = caseMatch.index;
        const followingCode = source.slice(matchIndex, matchIndex + 120);
        const isFlagOnly = followingCode.includes('shift 1') || (!followingCode.includes('shift 2') && followingCode.includes('shift'));

        properties[optName] = {
          type: isFlagOnly ? 'boolean' : 'string',
          description: `Shell CLI option ${rawFlag}`
        };
      }
    }

    // Check for getopts string: getopts "f:c:d:v" opt
    const getoptsRegex = /getopts\s+["']([^"']+)["']/g;
    let getoptsMatch: RegExpExecArray | null;
    while ((getoptsMatch = getoptsRegex.exec(source)) !== null) {
      const optString = getoptsMatch[1];
      for (let i = 0; i < optString.length; i++) {
        const char = optString[i];
        if (char === ':') continue;
        const takesValue = optString[i + 1] === ':';
        const pName = `opt_${char}`;

        if (!properties[pName] && char !== 'h') {
          properties[pName] = {
            type: takesValue ? 'string' : 'boolean',
            description: `Command flag -${char}${takesValue ? ' <value>' : ''}`
          };
        }
      }
    }

    // Check for positional variable captures: CLUSTER="${1:-prod}" or TARGET="$1"
    const positionalVarRegex = /([A-Z0-9_]+)=["']?\$\{?(\d+)(?::-(.*?))?\}?["']?/g;
    let posMatch: RegExpExecArray | null;
    while ((posMatch = positionalVarRegex.exec(source)) !== null) {
      const varName = posMatch[1].toLowerCase();
      const posIndex = posMatch[2];
      const defaultVal = posMatch[3];

      if (posIndex !== '0' && !properties[varName]) {
        properties[varName] = {
          type: 'string',
          description: `Positional argument #${posIndex} (${varName})`,
          default: defaultVal || undefined
        };
        if (!defaultVal) {
          required.push(varName);
        }
      }
    }

    // 3. Determine Risk Level from shell commands present in the script
    let riskLevel: ToolRiskLevel = 'read_only';
    const lowerSource = source.toLowerCase();
    const destructiveCommands = ['rm -', 'rmdir', 'docker rm', 'docker rmi', 'docker system prune', 'prune', 'kubectl delete', 'helm uninstall', 'drop', 'delete', 'truncate', 'destroy', 'kill', 'purge'];
    const writeCommands = ['docker run', 'docker build', 'kubectl apply', 'kubectl create', 'helm install', 'helm upgrade', 'mkdir', 'touch', 'mv', 'cp', 'curl -x post', 'curl -x put', 'curl -x delete'];

    if (destructiveCommands.some(cmd => lowerSource.includes(cmd))) {
      riskLevel = 'destructive_write';
    } else if (writeCommands.some(cmd => lowerSource.includes(cmd))) {
      riskLevel = 'idempotent_write';
    }

    const tool: SkillTool = {
      id: `${baseName}_run`,
      name: `${baseName}_run`,
      description,
      riskLevel,
      parameters: {
        type: 'object',
        properties,
        required,
        additionalProperties: false
      },
      execution: {
        type: 'script',
        language: 'bash',
        scriptPath: filename,
        command: `bash ${filename}`
      },
      guardrails: {
        allowDryRun: riskLevel === 'destructive_write',
        requireConfirmation: riskLevel === 'destructive_write',
        timeoutSeconds: 30
      }
    };

    const displayName = baseName
      .split('-')
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ') + ' Shell Tool';

    return {
      name: baseName,
      displayName,
      description,
      version: '1.0.0',
      schemaVersion: '1.0.0',
      category: 'devops',
      systemPrompt: `You have access to ${displayName} DevOps tools. Execute operations carefully and verify parameter inputs.`,
      triggerPhrases: [
        `execute ${baseName}`,
        `run ${filename}`,
        `run ${baseName} shell script`
      ],
      workflowInstructions: `Execute the ${filename} shell script safely. Verify parameters and run with dryRun=true if testing state changes.`,
      tools: [tool],
      examples: [
        {
          title: `Run ${filename}`,
          userPrompt: `Execute ${baseName} with default parameters`,
          expectedToolCalls: [
            {
              toolName: tool.name,
              args: {}
            }
          ]
        }
      ],
      envRequirements: [],
      guardrails: {
        ...DEFAULT_GUARDRAIL_POLICY
      },
      metadata: {
        sourceType: 'shell',
        sourceFile: filename,
        compiledAt: new Date().toISOString(),
        compilerVersion: '1.0.0',
        safetyScore: 85
      }
    };
  }
}
