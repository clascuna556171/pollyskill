import { SkillIR, SkillTool, ToolParameterSchema, JSONSchemaProperty, ToolRiskLevel } from '../ir/types.js';
import { DEFAULT_GUARDRAIL_POLICY } from '../guardrails/synthesizer.js';

export class ScriptParser {
  /**
   * Statically parses Python source code without executing untrusted code.
   * Extracts function definitions, docstrings, type annotations, and argparse flags.
   */
  static parsePython(source: string, filename = 'script.py'): SkillIR {
    const tools: SkillTool[] = [];
    const baseName = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();

    // 1. Detect argparse CLI arguments if present
    const argparseRegex = /add_argument\(\s*['"](--?[a-zA-Z0-9_-]+)['"]\s*(?:,\s*['"](--?[a-zA-Z0-9_-]+)['"])?[^)]*\)/g;
    const cliProps: Record<string, JSONSchemaProperty> = {};
    let argMatch: RegExpExecArray | null;

    while ((argMatch = argparseRegex.exec(source)) !== null) {
      const fullCall = argMatch[0];
      const flag = (argMatch[2] || argMatch[1]).replace(/^--?/, '');
      
      const helpMatch = fullCall.match(/help\s*=\s*['"]([^'"]+)['"]/);
      const isBool = fullCall.includes("action='store_true'") || fullCall.includes('action="store_true"');
      const isInt = fullCall.includes('type=int');

      cliProps[flag] = {
        type: isBool ? 'boolean' : (isInt ? 'integer' : 'string'),
        description: helpMatch ? helpMatch[1] : `CLI argument --${flag}`
      };
    }

    if (Object.keys(cliProps).length > 0) {
      tools.push({
        id: `${baseName}_cli`,
        name: `${baseName}_cli`,
        description: `Execute ${filename} CLI with structured parameters`,
        riskLevel: 'idempotent_write',
        parameters: {
          type: 'object',
          properties: cliProps,
          required: [],
          additionalProperties: false
        },
        execution: {
          type: 'script',
          language: 'python',
          scriptPath: filename,
          command: `python ${filename}`
        }
      });
    }

    // 2. Extract Python function signatures and docstrings
    // def func_name(param1: str, param2: int = 5) -> None:
    const funcRegex = /def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*(?:->\s*[^:]+)?:\s*(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')?/g;
    let match: RegExpExecArray | null;

    while ((match = funcRegex.exec(source)) !== null) {
      const funcName = match[1];
      if (funcName.startsWith('_')) continue; // Skip internal helper functions

      const rawParams = match[2];
      const docstring = (match[3] || match[4] || '').trim();

      // Determine risk level based on naming conventions
      let riskLevel: ToolRiskLevel = 'read_only';
      const lower = funcName.toLowerCase();
      if (lower.startsWith('delete') || lower.startsWith('drop') || lower.startsWith('remove') || lower.startsWith('purge')) {
        riskLevel = 'destructive_write';
      } else if (lower.startsWith('create') || lower.startsWith('update') || lower.startsWith('set') || lower.startsWith('write') || lower.startsWith('run')) {
        riskLevel = 'idempotent_write';
      }

      const properties: Record<string, JSONSchemaProperty> = {};
      const required: string[] = [];

      // Parse parameters
      const paramsList = rawParams.split(',').map(p => p.trim()).filter(Boolean);
      for (const p of paramsList) {
        if (p === 'self' || p === 'cls') continue;

        const [paramDecl, defaultVal] = p.split('=').map(s => s.trim());
        const [pName, typeHint] = paramDecl.split(':').map(s => s.trim());

        let schemaType: JSONSchemaProperty['type'] = 'string';
        if (typeHint) {
          const lowerType = typeHint.toLowerCase();
          if (lowerType.includes('int')) schemaType = 'integer';
          else if (lowerType.includes('float') || lowerType.includes('number')) schemaType = 'number';
          else if (lowerType.includes('bool')) schemaType = 'boolean';
          else if (lowerType.includes('list') || lowerType.includes('sequence')) schemaType = 'array';
          else if (lowerType.includes('dict')) schemaType = 'object';
        }

        // Try to find param description in docstring
        const paramDocRegex = new RegExp(`:param\\s+${pName}:\\s*([^\\n]+)`, 'i');
        const paramDocMatch = docstring.match(paramDocRegex);

        properties[pName] = {
          type: schemaType,
          description: paramDocMatch ? paramDocMatch[1].trim() : `Parameter ${pName}`
        };

        if (defaultVal === undefined) {
          required.push(pName);
        }
      }

      // First line of docstring as description
      const cleanDoc = docstring.split('\n')[0]?.trim() || `Execute ${funcName} from ${filename}`;

      tools.push({
        id: funcName,
        name: funcName,
        description: cleanDoc,
        riskLevel,
        parameters: {
          type: 'object',
          properties,
          required,
          additionalProperties: false
        },
        execution: {
          type: 'script',
          language: 'python',
          scriptPath: filename,
          command: `python -c "import ${baseName}; ${baseName}.${funcName}()"`
        }
      });
    }

    const title = baseName.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    return {
      version: '1.0.0',
      schemaVersion: '1.0.0',
      name: baseName,
      displayName: `${title} Skill`,
      description: `Agent skill extracted via AST from ${filename}`,
      category: 'developer_tool',
      systemPrompt: `You have access to ${title} automation tools. Execute tools with proper arguments and inspect returned status codes.`,
      workflowInstructions: `1. Identify the requested operation.\n2. Verify function parameters against definitions.\n3. Execute the tool and analyze stdout/stderr output.`,
      triggerPhrases: tools.map(t => `run ${t.name}`),
      tools,
      guardrails: DEFAULT_GUARDRAIL_POLICY,
      envRequirements: [
        {
          name: 'PYTHONPATH',
          description: 'Python module search path',
          required: false,
          defaultValue: '.'
        }
      ],
      examples: [
        {
          title: `Run ${tools[0]?.name || 'default action'}`,
          userPrompt: `Execute ${tools[0]?.name || 'the script'}`,
          expectedToolCalls: tools[0] ? [{ toolName: tools[0].name, args: {} }] : []
        }
      ],
      metadata: {
        sourceType: 'python',
        sourceFile: filename,
        compiledAt: new Date().toISOString(),
        compilerVersion: '1.0.0',
        safetyScore: 85
      }
    };
  }

  /**
   * Statically parses TypeScript / JavaScript source code.
   */
  static parseTypeScript(source: string, filename = 'script.ts'): SkillIR {
    const tools: SkillTool[] = [];
    const baseName = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();

    // Match exported functions: export function foo(a: string, b?: number)
    const fnRegex = /(?:\/\*\*([\s\S]*?)\*\/[\s\n]*)?export\s+(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/g;
    let match: RegExpExecArray | null;

    while ((match = fnRegex.exec(source)) !== null) {
      const jsdoc = (match[1] || '').trim();
      const fnName = match[2];
      const rawParams = match[3];

      const cleanDoc = jsdoc.split('\n')[0]?.replace(/^\s*\*\s*/, '').trim() || `Invoke function ${fnName}`;

      let riskLevel: ToolRiskLevel = 'read_only';
      const lower = fnName.toLowerCase();
      if (lower.startsWith('delete') || lower.startsWith('drop') || lower.startsWith('remove') || lower.startsWith('purge')) {
        riskLevel = 'destructive_write';
      } else if (lower.startsWith('create') || lower.startsWith('update') || lower.startsWith('write') || lower.startsWith('post')) {
        riskLevel = 'idempotent_write';
      }

      const properties: Record<string, JSONSchemaProperty> = {};
      const required: string[] = [];

      const params = rawParams.split(',').map(p => p.trim()).filter(Boolean);
      for (const p of params) {
        const [namePart, typePart] = p.split(':').map(s => s.trim());
        const isOptional = namePart.endsWith('?');
        const cleanName = namePart.replace('?', '');

        let pType: JSONSchemaProperty['type'] = 'string';
        if (typePart) {
          const lType = typePart.toLowerCase();
          if (lType.includes('number')) pType = 'number';
          else if (lType.includes('boolean')) pType = 'boolean';
          else if (lType.includes('[]') || lType.includes('array')) pType = 'array';
          else if (lType.includes('record') || lType.includes('object')) pType = 'object';
        }

        properties[cleanName] = {
          type: pType,
          description: `Parameter ${cleanName}`
        };

        if (!isOptional) {
          required.push(cleanName);
        }
      }

      tools.push({
        id: fnName,
        name: fnName,
        description: cleanDoc,
        riskLevel,
        parameters: {
          type: 'object',
          properties,
          required,
          additionalProperties: false
        },
        execution: {
          type: 'script',
          language: 'typescript',
          scriptPath: filename,
          command: `npx tsx -e "import { ${fnName} } from './${filename}'; ${fnName}()"`
        }
      });
    }

    const title = baseName.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    return {
      version: '1.0.0',
      schemaVersion: '1.0.0',
      name: baseName,
      displayName: `${title} Skill`,
      description: `TypeScript skill extracted from ${filename}`,
      category: 'developer_tool',
      systemPrompt: `You have access to ${title} programmatic functions. Validate types before dispatch.`,
      workflowInstructions: `1. Select the relevant function.\n2. Ensure type consistency.\n3. Execute safely and handle return promises.`,
      triggerPhrases: tools.map(t => `call ${t.name}`),
      tools,
      guardrails: DEFAULT_GUARDRAIL_POLICY,
      envRequirements: [],
      examples: [
        {
          title: `Invoke ${tools[0]?.name || 'default action'}`,
          userPrompt: `Call ${tools[0]?.name || 'function'}`,
          expectedToolCalls: tools[0] ? [{ toolName: tools[0].name, args: {} }] : []
        }
      ],
      metadata: {
        sourceType: 'typescript',
        sourceFile: filename,
        compiledAt: new Date().toISOString(),
        compilerVersion: '1.0.0',
        safetyScore: 88
      }
    };
  }
}
