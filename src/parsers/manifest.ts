import YAML from 'yaml';
import { SkillIR, SkillTool, ToolRiskLevel } from '../ir/types.js';
import { DEFAULT_GUARDRAIL_POLICY } from '../guardrails/synthesizer.js';

interface RawSkillSpec {
  name: string;
  displayName?: string;
  version?: string;
  description: string;
  category?: SkillIR['category'];
  systemPrompt?: string;
  workflowInstructions?: string;
  triggerPhrases?: string[];
  tools?: Array<{
    name: string;
    description: string;
    riskLevel?: ToolRiskLevel;
    command?: string;
    endpoint?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    parameters?: Record<string, {
      type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
      description?: string;
      required?: boolean;
      default?: unknown;
    }>;
  }>;
  guardrails?: Partial<SkillIR['guardrails']>;
  envRequirements?: SkillIR['envRequirements'];
  examples?: SkillIR['examples'];
}

export class ManifestParser {
  static parse(content: string, filename = 'skillspec.yaml'): SkillIR {
    let parsed: RawSkillSpec;
    try {
      parsed = YAML.parse(content) as RawSkillSpec;
    } catch {
      try {
        parsed = JSON.parse(content) as RawSkillSpec;
      } catch (err: unknown) {
        throw new Error(`Failed to parse SkillSpec YAML or JSON: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!parsed || !parsed.name || !parsed.description) {
      throw new Error('SkillSpec must contain at least "name" and "description"');
    }

    const tools: SkillTool[] = (parsed.tools || []).map(t => {
      const properties: Record<string, { type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'; description?: string; default?: unknown }> = {};
      const required: string[] = [];

      for (const [paramName, paramDef] of Object.entries(t.parameters || {})) {
        properties[paramName] = {
          type: paramDef.type || 'string',
          description: paramDef.description,
          default: paramDef.default
        };
        if (paramDef.required) {
          required.push(paramName);
        }
      }

      const riskLevel: ToolRiskLevel = t.riskLevel || (
        t.name.toLowerCase().includes('delete') || t.name.toLowerCase().includes('drop')
          ? 'destructive_write'
          : (t.name.toLowerCase().includes('create') || t.name.toLowerCase().includes('update') ? 'idempotent_write' : 'read_only')
      );

      return {
        id: t.name,
        name: t.name,
        description: t.description,
        riskLevel,
        parameters: {
          type: 'object',
          properties,
          required,
          additionalProperties: false
        },
        execution: t.endpoint ? {
          type: 'http',
          endpoint: t.endpoint,
          httpMethod: t.method || 'GET'
        } : {
          type: 'cli',
          command: t.command || `echo "Executing ${t.name}"`
        },
        guardrails: {
          requireConfirmation: riskLevel === 'destructive_write',
          allowDryRun: riskLevel !== 'read_only',
          timeoutSeconds: 30
        }
      };
    });

    return {
      version: parsed.version || '1.0.0',
      schemaVersion: '1.0.0',
      name: parsed.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
      displayName: parsed.displayName || parsed.name,
      description: parsed.description,
      category: parsed.category || 'general',
      systemPrompt: parsed.systemPrompt || `You are an AI assistant equipped with the ${parsed.name} operational capability.`,
      workflowInstructions: parsed.workflowInstructions || '1. Analyze user requirements.\n2. Invoke necessary tools with strict parameter constraints.\n3. Return clean structured summaries.',
      triggerPhrases: parsed.triggerPhrases || tools.map(t => `run ${t.name}`),
      tools,
      guardrails: {
        ...DEFAULT_GUARDRAIL_POLICY,
        ...parsed.guardrails
      },
      envRequirements: parsed.envRequirements || [],
      examples: parsed.examples || [],
      metadata: {
        sourceType: 'skillspec',
        sourceFile: filename,
        compiledAt: new Date().toISOString(),
        compilerVersion: '1.0.0',
        safetyScore: 92
      }
    };
  }
}
