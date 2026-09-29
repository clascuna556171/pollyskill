import { SkillIR, SkillTool } from '../ir/types.js';

export interface SandboxExecutionResult {
  success: boolean;
  toolName: string;
  args: Record<string, unknown>;
  output?: unknown;
  guardrailBlocked?: boolean;
  blockReason?: string;
  durationMs: number;
}

export class SandboxRunner {
  /**
   * Executes a simulated tool run inside the local PolySkill sandbox,
   * testing guardrails, input schemas, and deterministic safety checks.
   */
  static simulateExecution(ir: SkillIR, toolName: string, args: Record<string, unknown>): SandboxExecutionResult {
    const start = performance.now();

    const tool = ir.tools.find(t => t.name === toolName);
    if (!tool) {
      return {
        success: false,
        toolName,
        args,
        durationMs: performance.now() - start,
        blockReason: `Tool '${toolName}' not found in skill '${ir.name}'.`
      };
    }

    // 1. Guardrail Test: Path traversal
    for (const [key, val] of Object.entries(args)) {
      if (typeof val === 'string') {
        if (/(\.\.[\\/]|(\/etc|\/root|\/sys|\/proc)[\\/\s]|([A-Za-z]:[\\/](Windows|System32)))/i.test(val)) {
          return {
            success: false,
            toolName,
            args,
            guardrailBlocked: true,
            blockReason: `[GUARDRAIL_VIOLATION] Argument '${key}' contains prohibited path traversal sequence: '${val}'`,
            durationMs: performance.now() - start
          };
        }

        if (/(\||\;|\&{2}|\`|\$\()/.test(val)) {
          return {
            success: false,
            toolName,
            args,
            guardrailBlocked: true,
            blockReason: `[GUARDRAIL_VIOLATION] Argument '${key}' contains forbidden shell execution characters: '${val}'`,
            durationMs: performance.now() - start
          };
        }
      }
    }

    // 2. Guardrail Test: Destructive confirmation
    if (tool.riskLevel === 'destructive_write' || tool.guardrails?.requireConfirmation) {
      const isConfirmed = args.confirm === true;
      const isDryRun = args.dryRun === true;

      if (!isConfirmed && !isDryRun) {
        return {
          success: false,
          toolName,
          args,
          guardrailBlocked: true,
          blockReason: `[CONFIRMATION_REQUIRED] Tool '${toolName}' is marked as '${tool.riskLevel}'. Execution requires 'confirm: true' or 'dryRun: true'.`,
          durationMs: performance.now() - start
        };
      }
    }

    // 3. Schema validation: check required properties
    for (const reqProp of tool.parameters.required || []) {
      if (args[reqProp] === undefined || args[reqProp] === null) {
        return {
          success: false,
          toolName,
          args,
          blockReason: `[SCHEMA_ERROR] Missing required parameter '${reqProp}' for tool '${toolName}'.`,
          durationMs: performance.now() - start
        };
      }
    }

    // 4. Simulated Execution
    const isDryRun = args.dryRun === true;
    const output = {
      status: isDryRun ? 'dry_run_simulated' : 'executed',
      tool: toolName,
      riskLevel: tool.riskLevel,
      parameters: args,
      simulatedResponse: {
        message: isDryRun
          ? `[DRY_RUN] Simulated execution of ${toolName} completed with 0 state changes.`
          : `[LIVE_EXECUTION] Successfully performed ${toolName} with provided arguments.`,
        targetEndpointOrCommand: tool.execution.endpoint || tool.execution.command || `${tool.execution.type} execution`,
        recordsAffected: isDryRun ? 0 : 1
      }
    };

    return {
      success: true,
      toolName,
      args,
      output,
      durationMs: Math.round((performance.now() - start) * 100) / 100
    };
  }
}
