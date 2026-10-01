import { SkillIR, SkillTool, JSONSchemaProperty, ToolRiskLevel } from '../ir/types.js';
import { DEFAULT_GUARDRAIL_POLICY } from '../guardrails/synthesizer.js';

interface ParsedInterface {
  name: string;
  properties: Record<string, JSONSchemaProperty>;
  required: string[];
}

export class TypeScriptParser {
  /**
   * Statically parses TypeScript / JavaScript source code without executing untrusted code.
   * Extracts exported functions, arrow functions, JSDoc annotations, interfaces, types, and string literal unions.
   */
  static parse(source: string, filename = 'script.ts'): SkillIR {
    const baseName = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();

    // 1. Extract File/Module Header Description
    let moduleDescription = '';
    const headerMatch = source.match(/^\s*\/\*\*([\s\S]*?)\*\//);
    if (headerMatch) {
      const headerContent = headerMatch[1];
      const overviewMatch = headerContent.match(/@fileoverview\s+(.*)/i) || headerContent.match(/@description\s+(.*)/i);
      if (overviewMatch) {
        moduleDescription = overviewMatch[1].trim();
      } else {
        const cleaned = headerContent
          .split('\n')
          .map(l => l.replace(/^\s*\*\s?/, '').trim())
          .filter(l => l.length > 0 && !l.startsWith('@'))
          .join(' ');
        if (cleaned) {
          moduleDescription = cleaned;
        }
      }
    }

    if (!moduleDescription) {
      moduleDescription = `TypeScript operational tools compiled from ${filename}`;
    }

    // 2. Parse Interfaces and Type Aliases
    const knownInterfaces = this.extractInterfacesAndTypes(source);

    // 3. Parse Exported Functions & Arrow Functions
    const tools: SkillTool[] = [];
    const functionEntries = this.extractFunctionEntries(source);

    for (const entry of functionEntries) {
      const { name: fnName, rawParams, jsdoc, isAsync } = entry;

      // Extract JSDoc Summary and @param annotations
      const { summary: docSummary, paramDocs } = this.parseJSDoc(jsdoc, fnName);

      // Determine Risk Level
      const riskLevel = this.determineRiskLevel(fnName);

      // Parse Parameters
      const { properties, required } = this.parseParameters(rawParams, knownInterfaces, paramDocs);

      tools.push({
        id: fnName,
        name: fnName,
        description: docSummary,
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

    // Auto-detect category
    let category: SkillIR['category'] = 'developer_tool';
    const lowerAll = (source + ' ' + filename).toLowerCase();
    if (lowerAll.includes('cloud') || lowerAll.includes('aws') || lowerAll.includes('azure') || lowerAll.includes('k8s') || lowerAll.includes('ecs')) {
      category = 'cloud';
    } else if (lowerAll.includes('deploy') || lowerAll.includes('ci') || lowerAll.includes('docker') || lowerAll.includes('git')) {
      category = 'devops';
    } else if (lowerAll.includes('db') || lowerAll.includes('postgres') || lowerAll.includes('sql') || lowerAll.includes('mongo')) {
      category = 'database';
    } else if (lowerAll.includes('billing') || lowerAll.includes('stripe') || lowerAll.includes('payment') || lowerAll.includes('invoice')) {
      category = 'finance';
    } else if (lowerAll.includes('security') || lowerAll.includes('auth') || lowerAll.includes('audit')) {
      category = 'security';
    }

    return {
      version: '1.0.0',
      schemaVersion: '1.0.0',
      name: baseName,
      displayName: title,
      description: moduleDescription,
      category,
      systemPrompt: `You are an autonomous operations agent with access to TypeScript tools for ${title}. Execute tools safely and respect execution parameters.`,
      workflowInstructions: tools.map((t, idx) => `${idx + 1}. Use ${t.name} to ${t.description.toLowerCase()}`).join('\n') || 'Execute tools according to user requirements.',
      triggerPhrases: tools.map(t => `${t.name.replace(/_/g, ' ')}`).concat([`execute ${baseName}`]),
      tools,
      guardrails: { ...DEFAULT_GUARDRAIL_POLICY },
      envRequirements: [],
      examples: [
        {
          title: `Execute ${tools[0]?.name || 'default action'}`,
          userPrompt: `Run ${tools[0]?.name || 'the tool'}`,
          expectedToolCalls: tools[0] ? [{ toolName: tools[0].name, args: {} }] : []
        }
      ],
      metadata: {
        sourceType: 'typescript',
        sourceFile: filename,
        compiledAt: new Date().toISOString(),
        compilerVersion: '1.0.0',
        safetyScore: 85
      }
    };
  }

  /**
   * Statically extracts interface and type alias schemas from TypeScript source.
   */
  private static extractInterfacesAndTypes(source: string): Map<string, ParsedInterface> {
    const map = new Map<string, ParsedInterface>();

    // 1. Match: interface Name { prop: type; ... }
    const interfaceRegex = /interface\s+([a-zA-Z0-9_]+)(?:\s+extends\s+[^{]+)?\s*\{([\s\S]*?)\}/g;
    let ifaceMatch: RegExpExecArray | null;
    while ((ifaceMatch = interfaceRegex.exec(source)) !== null) {
      const name = ifaceMatch[1];
      const body = ifaceMatch[2];
      map.set(name, this.parseTypeBody(name, body));
    }

    // 2. Match: type Name = { prop: type; ... }
    const typeObjRegex = /type\s+([a-zA-Z0-9_]+)\s*=\s*\{([\s\S]*?)\}/g;
    let typeMatch: RegExpExecArray | null;
    while ((typeMatch = typeObjRegex.exec(source)) !== null) {
      const name = typeMatch[1];
      const body = typeMatch[2];
      map.set(name, this.parseTypeBody(name, body));
    }

    return map;
  }

  /**
   * Parses body of an interface or object type: "prop1: string; prop2?: number;"
   */
  private static parseTypeBody(typeName: string, body: string): ParsedInterface {
    const properties: Record<string, JSONSchemaProperty> = {};
    const required: string[] = [];

    // Match lines like: propName?: type; or propName: type; or // comments
    const lines = body.split('\n');
    let pendingDoc = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('//')) {
        pendingDoc = trimmed.replace(/^\/\/\s*/, '');
        continue;
      }
      if (trimmed.startsWith('/**') || trimmed.startsWith('*')) {
        const cleaned = trimmed.replace(/^\/?\*+\s?/, '').replace(/\*\/$/, '').trim();
        if (cleaned) pendingDoc = cleaned;
        continue;
      }

      const propMatch = trimmed.match(/^([a-zA-Z0-9_]+)(\?)?:\s*([^;,\n]+)[;,]?/);
      if (propMatch) {
        const propName = propMatch[1];
        const isOptional = Boolean(propMatch[2]);
        const rawType = propMatch[3].trim();

        const schemaProp = this.mapTypeStringToSchema(rawType);
        if (pendingDoc) {
          schemaProp.description = pendingDoc;
          pendingDoc = '';
        } else {
          schemaProp.description = `Field ${propName}`;
        }

        properties[propName] = schemaProp;
        if (!isOptional) {
          required.push(propName);
        }
      }
    }

    return {
      name: typeName,
      properties,
      required
    };
  }

  /**
   * Extracts function signatures (standard exported functions + exported arrow functions).
   */
  private static extractFunctionEntries(source: string): Array<{
    name: string;
    rawParams: string;
    jsdoc: string;
    isAsync: boolean;
  }> {
    const entries: Array<{ name: string; rawParams: string; jsdoc: string; isAsync: boolean }> = [];

    // 1. Exported function declarations: export [async] function name(...)
    const fnDeclRegex = /(?:\/\*\*([\s\S]*?)\*\/[\s\n]*)?export\s+(async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(/g;
    let match: RegExpExecArray | null;

    while ((match = fnDeclRegex.exec(source)) !== null) {
      const jsdoc = match[1] || '';
      const isAsync = Boolean(match[2]);
      const name = match[3];
      const startParenIdx = match.index + match[0].length;

      let rawParams = '';
      let depth = 1;
      let i = startParenIdx;
      while (i < source.length && depth > 0) {
        if (source[i] === '(') depth++;
        else if (source[i] === ')') depth--;
        if (depth > 0) rawParams += source[i];
        i++;
      }

      entries.push({
        jsdoc,
        name,
        isAsync,
        rawParams: rawParams.trim()
      });
    }

    // 2. Exported arrow functions: export const name = [async] (...) =>
    const arrowRegex = /(?:\/\*\*([\s\S]*?)\*\/[\s\n]*)?export\s+const\s+([a-zA-Z0-9_]+)\s*=\s*(async\s+)?\(/g;
    while ((match = arrowRegex.exec(source)) !== null) {
      const jsdoc = match[1] || '';
      const name = match[2];
      const isAsync = Boolean(match[3]);
      const startParenIdx = match.index + match[0].length;

      let rawParams = '';
      let depth = 1;
      let i = startParenIdx;
      while (i < source.length && depth > 0) {
        if (source[i] === '(') depth++;
        else if (source[i] === ')') depth--;
        if (depth > 0) rawParams += source[i];
        i++;
      }

      if (!entries.some(e => e.name === name)) {
        entries.push({
          jsdoc,
          name,
          isAsync,
          rawParams: rawParams.trim()
        });
      }
    }

    return entries;
  }

  /**
   * Parses JSDoc block for description and @param tags.
   */
  private static parseJSDoc(jsdoc: string, defaultName: string): {
    summary: string;
    paramDocs: Record<string, string>;
  } {
    const paramDocs: Record<string, string> = {};
    if (!jsdoc) {
      return { summary: `Invoke ${defaultName}`, paramDocs };
    }

    const lines = jsdoc
      .split('\n')
      .map(l => l.replace(/^\s*\*\s?/, '').trim())
      .filter(Boolean);

    const summaryLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('@param')) {
        // Match @param {type} [name] description OR @param name description
        const pMatch = line.match(/^@param\s+(?:\{[^}]+\}\s+)?\[?([a-zA-Z0-9_]+)\]?\s*(.*)$/);
        if (pMatch) {
          const pName = pMatch[1];
          const pDesc = pMatch[2].replace(/^-\s*/, '').trim();
          paramDocs[pName] = pDesc;
        }
      } else if (!line.startsWith('@')) {
        summaryLines.push(line);
      }
    }

    const summary = summaryLines.join(' ').trim() || `Invoke ${defaultName}`;
    return { summary, paramDocs };
  }

  /**
   * Parses raw parameter signature, handling destructured options object or positional params.
   */
  private static parseParameters(
    rawParams: string,
    knownInterfaces: Map<string, ParsedInterface>,
    paramDocs: Record<string, string>
  ): { properties: Record<string, JSONSchemaProperty>; required: string[] } {
    const properties: Record<string, JSONSchemaProperty> = {};
    const required: string[] = [];

    const trimmed = rawParams.trim();
    if (!trimmed) {
      return { properties, required };
    }

    // Case A: Destructured single object parameter
    // e.g. { clusterId, env = 'staging', replicas }: DeployConfig
    const destructuredMatch = trimmed.match(/^\{([\s\S]*?)\}(?:\s*:\s*([a-zA-Z0-9_]+))?/);
    if (destructuredMatch) {
      const innerProps = destructuredMatch[1];
      const typeRef = destructuredMatch[2]?.trim();

      // If typed with an existing interface, use that interface as base!
      if (typeRef && knownInterfaces.has(typeRef)) {
        const iface = knownInterfaces.get(typeRef)!;
        Object.assign(properties, iface.properties);
        required.push(...iface.required);
      }

      // Parse individual destructured tokens for defaults & descriptions
      const tokens = innerProps.split(',').map(t => t.trim()).filter(Boolean);
      for (const tok of tokens) {
        const [left, defaultVal] = tok.split('=').map(s => s.trim());
        const propName = left;

        if (!properties[propName]) {
          let inferredType: JSONSchemaProperty['type'] = 'string';
          let defaultParsed: unknown = undefined;

          if (defaultVal) {
            if (/^\d+$/.test(defaultVal)) {
              inferredType = 'integer';
              defaultParsed = parseInt(defaultVal, 10);
            } else if (/^\d+\.\d+$/.test(defaultVal)) {
              inferredType = 'number';
              defaultParsed = parseFloat(defaultVal);
            } else if (defaultVal === 'true' || defaultVal === 'false') {
              inferredType = 'boolean';
              defaultParsed = defaultVal === 'true';
            } else {
              defaultParsed = defaultVal.replace(/^['"]|['"]$/g, '');
            }
          }

          properties[propName] = {
            type: inferredType,
            description: paramDocs[propName] || `Parameter ${propName}`,
            default: defaultParsed
          };
        } else {
          if (paramDocs[propName]) {
            properties[propName].description = paramDocs[propName];
          }
          if (defaultVal) {
            properties[propName].default = defaultVal.replace(/^['"]|['"]$/g, '');
          }
        }

        // If it has a default value, it's not strictly required
        if (defaultVal) {
          const reqIdx = required.indexOf(propName);
          if (reqIdx !== -1) required.splice(reqIdx, 1);
        } else if (!required.includes(propName) && !tok.includes('?')) {
          required.push(propName);
        }
      }

      return { properties, required };
    }

    // Case B: Standard positional parameters
    // e.g. clusterId: string, env: 'dev' | 'prod', replicas: number = 3
    const paramParts = this.splitParameters(trimmed);

    for (const part of paramParts) {
      if (!part.trim()) continue;

      const [namePart, typeAndDefault] = part.split(':').map(s => s.trim());
      if (!namePart) continue;

      const [cleanName, inlineDefault] = namePart.split('=').map(s => s.trim());
      const isOptional = cleanName.endsWith('?') || Boolean(inlineDefault);
      const paramName = cleanName.replace('?', '');

      let rawType = 'string';
      let explicitDefault = inlineDefault;

      if (typeAndDefault) {
        const [tPart, dPart] = typeAndDefault.split('=').map(s => s.trim());
        rawType = tPart;
        if (dPart) explicitDefault = dPart;
      }

      // Check if rawType is a known interface
      if (knownInterfaces.has(rawType)) {
        const iface = knownInterfaces.get(rawType)!;
        if (paramParts.length === 1) {
          Object.assign(properties, iface.properties);
          for (const req of iface.required) {
            if (!required.includes(req)) required.push(req);
          }
        } else {
          properties[paramName] = {
            type: 'object',
            description: paramDocs[paramName] || `Configuration object (${rawType})`,
            properties: iface.properties,
            required: iface.required
          };
          if (!isOptional) required.push(paramName);
        }
        continue;
      }

      const schemaProp = this.mapTypeStringToSchema(rawType);
      schemaProp.description = paramDocs[paramName] || `Parameter ${paramName}`;

      if (explicitDefault) {
        const cleanDef = explicitDefault.replace(/^['"]|['"]$/g, '');
        if (schemaProp.type === 'integer' || schemaProp.type === 'number') {
          schemaProp.default = Number(cleanDef);
        } else if (schemaProp.type === 'boolean') {
          schemaProp.default = cleanDef === 'true';
        } else {
          schemaProp.default = cleanDef;
        }
      }

      properties[paramName] = schemaProp;
      if (!isOptional && !explicitDefault) {
        required.push(paramName);
      }
    }

    return { properties, required };
  }

  /**
   * Splits parameter string accounting for nested union types or generics.
   */
  private static splitParameters(raw: string): string[] {
    const parts: string[] = [];
    let current = '';
    let parenDepth = 0;
    let braceDepth = 0;
    let angleDepth = 0;

    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c === '(') parenDepth++;
      else if (c === ')') parenDepth--;
      else if (c === '{') braceDepth++;
      else if (c === '}') braceDepth--;
      else if (c === '<') angleDepth++;
      else if (c === '>') angleDepth--;

      if (c === ',' && parenDepth === 0 && braceDepth === 0 && angleDepth === 0) {
        parts.push(current);
        current = '';
      } else {
        current += c;
      }
    }

    if (current.trim()) {
      parts.push(current);
    }
    return parts;
  }

  /**
   * Maps TypeScript type string (e.g. 'number', "'staging' | 'prod'", "string[]") to JSON Schema property.
   */
  private static mapTypeStringToSchema(typeStr: string): JSONSchemaProperty {
    const clean = typeStr.trim();

    // Check for string literal union: 'staging' | 'production' or "v1" | "v2"
    if (clean.includes('|')) {
      const parts = clean.split('|').map(p => p.trim());
      const isStringUnion = parts.every(p => /^['"].*['"]$/.test(p));
      if (isStringUnion) {
        const enums = parts.map(p => p.replace(/^['"]|['"]$/g, ''));
        return {
          type: 'string',
          enum: enums
        };
      }
    }

    const lower = clean.toLowerCase();

    if (lower.startsWith('array<') || lower.endsWith('[]')) {
      let itemType: JSONSchemaProperty['type'] = 'string';
      if (lower.includes('number')) itemType = 'number';
      else if (lower.includes('boolean')) itemType = 'boolean';
      return {
        type: 'array',
        items: { type: itemType }
      };
    }

    if (lower === 'number' || lower === 'float' || lower === 'double') {
      return { type: 'number' };
    }
    if (lower === 'int' || lower === 'integer') {
      return { type: 'integer' };
    }
    if (lower === 'boolean' || lower === 'bool') {
      return { type: 'boolean' };
    }
    if (lower === 'object' || lower === 'record<string, any>' || lower === 'record<string, unknown>') {
      return { type: 'object' };
    }

    return { type: 'string' };
  }

  /**
   * Deterministic Risk Level Evaluation based on function naming heuristics.
   */
  private static determineRiskLevel(fnName: string): ToolRiskLevel {
    const lower = fnName.toLowerCase();

    // Destructive mutation verbs
    if (
      lower.startsWith('delete') ||
      lower.startsWith('drop') ||
      lower.startsWith('destroy') ||
      lower.startsWith('purge') ||
      lower.startsWith('terminate') ||
      lower.startsWith('revoke') ||
      lower.startsWith('remove') ||
      lower.startsWith('kill') ||
      lower.includes('danger')
    ) {
      return 'destructive_write';
    }

    // Idempotent / Non-destructive write verbs
    if (
      lower.startsWith('create') ||
      lower.startsWith('deploy') ||
      lower.startsWith('update') ||
      lower.startsWith('scale') ||
      lower.startsWith('set') ||
      lower.startsWith('restart') ||
      lower.startsWith('write') ||
      lower.startsWith('apply') ||
      lower.startsWith('post') ||
      lower.startsWith('patch') ||
      lower.startsWith('sync') ||
      lower.startsWith('put')
    ) {
      return 'idempotent_write';
    }

    return 'read_only';
  }
}
