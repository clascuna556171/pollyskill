/**
 * PolySkill Universal Intermediate Representation (IR)
 * 
 * Canonical representation of an Agent Skill agnostic of target runtime.
 * Serves as the compiler AST between arbitrary input sources (OpenAPI, Python, TS, CLI, Runbooks)
 * and agent execution targets (Google Antigravity, MCP, Cursor, OpenAI).
 */

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  default?: unknown;
  enum?: (string | number | boolean)[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
}

export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export type ToolRiskLevel = 'read_only' | 'idempotent_write' | 'destructive_write' | 'privileged';

export interface SkillTool {
  id: string;
  name: string;
  description: string;
  riskLevel: ToolRiskLevel;
  parameters: ToolParameterSchema;
  execution: {
    type: 'script' | 'http' | 'cli' | 'code_snippet';
    command?: string;
    scriptPath?: string;
    httpMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    endpoint?: string;
    language?: 'python' | 'bash' | 'typescript' | 'node';
    code?: string;
  };
  guardrails?: {
    allowDryRun?: boolean;
    requireConfirmation?: boolean;
    restrictedPaths?: string[];
    allowedDomains?: string[];
    blockPrivateNetworks?: boolean;
    blockCredentialLeak?: boolean;
    redactCredentialOutput?: boolean;
    timeoutSeconds?: number;
    forbiddenPatterns?: string[];
  };
}

export interface GuardrailPolicy {
  enablePathTraversalProtection: boolean;
  enableDestructiveConfirmation: boolean;
  enableDryRunDefault: boolean;
  enableSSRFProtection?: boolean;
  enableCredentialProtection?: boolean;
  defaultTimeoutSeconds: number;
  blockedShellCommands: string[];
  allowedFileExtensions: string[];
  sanitizationRegexes: { pattern: string; reason: string }[];
  blockedNetworkPatterns?: string[];
}

export interface SkillExample {
  title: string;
  userPrompt: string;
  expectedToolCalls: {
    toolName: string;
    args: Record<string, unknown>;
  }[];
  notes?: string;
}

export interface EnvRequirement {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
  secret?: boolean;
}

export interface SkillIR {
  version: string;
  schemaVersion: '1.0.0';
  name: string;
  displayName: string;
  description: string;
  author?: string;
  category: 'cloud' | 'devops' | 'database' | 'finance' | 'security' | 'developer_tool' | 'general';
  
  // Behavioral directives & context
  systemPrompt: string;
  workflowInstructions: string;
  triggerPhrases: string[];
  
  // Functional capabilities
  tools: SkillTool[];
  
  // Security & Safety
  guardrails: GuardrailPolicy;
  
  // Environment & External Dependencies
  envRequirements: EnvRequirement[];
  
  // Few-shot demonstration cases
  examples: SkillExample[];
  
  // Source metadata
  metadata: {
    sourceType: 'openapi' | 'python' | 'typescript' | 'shell' | 'skillspec' | 'manual';
    sourceFile?: string;
    compiledAt: string;
    compilerVersion: string;
    safetyScore: number; // 0 - 100
  };
}

export type CompilerTarget = 'antigravity' | 'mcp' | 'mcp-sse' | 'cursor' | 'openai' | 'all';

export interface CompilationResult {
  ir: SkillIR;
  targetFiles: Record<string, string>; // relativePath -> content
  diagnostics: {
    level: 'info' | 'warning' | 'error';
    message: string;
    code?: string;
  }[];
  auditReport: {
    safetyScore: number;
    findings: { severity: 'low' | 'medium' | 'high'; message: string; rule: string }[];
  };
}
