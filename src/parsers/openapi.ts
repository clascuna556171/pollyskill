import { SkillIR, SkillTool, ToolParameterSchema, JSONSchemaProperty, ToolRiskLevel } from '../ir/types.js';
import { DEFAULT_GUARDRAIL_POLICY } from '../guardrails/synthesizer.js';

interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: Array<{
    name: string;
    in: 'query' | 'path' | 'header' | 'cookie';
    description?: string;
    required?: boolean;
    schema?: Record<string, unknown>;
  }>;
  requestBody?: {
    description?: string;
    required?: boolean;
    content?: {
      'application/json'?: {
        schema?: Record<string, unknown>;
      };
    };
  };
}

interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, Record<string, OpenAPIOperation>>;
}

export class OpenAPIParser {
  static parse(specRaw: string | Record<string, unknown>, sourcePath?: string): SkillIR {
    let spec: OpenAPISpec;
    if (typeof specRaw === 'string') {
      try {
        spec = JSON.parse(specRaw) as OpenAPISpec;
      } catch {
        throw new Error('Invalid JSON format for OpenAPI specification');
      }
    } else {
      spec = specRaw as unknown as OpenAPISpec;
    }

    if (!spec.paths || !spec.info) {
      throw new Error('OpenAPI specification must contain "info" and "paths" fields');
    }

    const name = spec.info.title
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'api-skill';

    const tools: SkillTool[] = [];
    const triggerPhrases: string[] = [];

    const baseUrl = spec.servers?.[0]?.url || 'https://api.example.com';

    for (const [pathKey, pathMethods] of Object.entries(spec.paths)) {
      for (const [methodRaw, opRaw] of Object.entries(pathMethods)) {
        const method = methodRaw.toUpperCase();
        if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) continue;

        const op = opRaw as OpenAPIOperation;
        const toolName = op.operationId || `${method.toLowerCase()}_${pathKey.replace(/[\/{}]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`;
        const description = op.summary || op.description || `${method} request to ${pathKey}`;

        // Determine Risk Level
        let riskLevel: ToolRiskLevel = 'read_only';
        if (method === 'DELETE') {
          riskLevel = 'destructive_write';
        } else if (['POST', 'PUT', 'PATCH'].includes(method)) {
          riskLevel = 'idempotent_write';
        }

        const properties: Record<string, JSONSchemaProperty> = {};
        const requiredFields: string[] = [];

        // Ingest path & query parameters
        if (Array.isArray(op.parameters)) {
          for (const param of op.parameters) {
            const propType = (param.schema?.type as JSONSchemaProperty['type']) || 'string';
            properties[param.name] = {
              type: propType,
              description: param.description || `Parameter in ${param.in}`
            };
            if (param.required || param.in === 'path') {
              requiredFields.push(param.name);
            }
          }
        }

        // Ingest requestBody JSON schema properties
        const bodySchema = op.requestBody?.content?.['application/json']?.schema;
        if (bodySchema && typeof bodySchema === 'object') {
          const bodyProps = (bodySchema.properties || {}) as Record<string, Record<string, unknown>>;
          for (const [propName, propDef] of Object.entries(bodyProps)) {
            properties[propName] = {
              type: (propDef.type as JSONSchemaProperty['type']) || 'string',
              description: (propDef.description as string) || `Request body field ${propName}`
            };
          }
          if (Array.isArray(bodySchema.required)) {
            requiredFields.push(...(bodySchema.required as string[]));
          }
        }

        const parameters: ToolParameterSchema = {
          type: 'object',
          properties,
          required: Array.from(new Set(requiredFields)),
          additionalProperties: false
        };

        tools.push({
          id: toolName,
          name: toolName,
          description,
          riskLevel,
          parameters,
          execution: {
            type: 'http',
            httpMethod: method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
            endpoint: `${baseUrl}${pathKey}`
          },
          guardrails: {
            requireConfirmation: riskLevel === 'destructive_write',
            allowDryRun: riskLevel !== 'read_only',
            timeoutSeconds: 30
          }
        });

        triggerPhrases.push(`use ${toolName} to ${description.toLowerCase()}`);
      }
    }

    return {
      version: spec.info.version || '1.0.0',
      schemaVersion: '1.0.0',
      name,
      displayName: spec.info.title,
      description: spec.info.description || `Agent skill compiled from ${spec.info.title} OpenAPI specification`,
      category: 'developer_tool',
      systemPrompt: `You are an autonomous assistant equipped with the ${spec.info.title} skill. Always validate required arguments before invocation. For destructive endpoints (DELETE/PUT), confirm parameters or simulate with dryRun where supported.`,
      workflowInstructions: `1. Select the relevant tool for the user request.\n2. Ensure all path and required body parameters are supplied.\n3. Verify HTTP response codes and parse JSON payloads systematically.`,
      triggerPhrases: triggerPhrases.slice(0, 10),
      tools,
      guardrails: DEFAULT_GUARDRAIL_POLICY,
      envRequirements: [
        {
          name: `${name.toUpperCase().replace(/-/g, '_')}_API_KEY`,
          description: `API Key / Bearer token to authenticate requests against ${spec.info.title}`,
          required: false,
          secret: true
        }
      ],
      examples: [
        {
          title: `Query ${tools[0]?.name || 'endpoint'}`,
          userPrompt: `Fetch data using ${tools[0]?.name || 'the first endpoint'}`,
          expectedToolCalls: tools[0] ? [{ toolName: tools[0].name, args: {} }] : []
        }
      ],
      metadata: {
        sourceType: 'openapi',
        sourceFile: sourcePath,
        compiledAt: new Date().toISOString(),
        compilerVersion: '1.0.0',
        safetyScore: 90
      }
    };
  }
}
