import { SkillIR, CompilerTarget, CompilationResult } from './ir/types.js';
import { UniversalParser } from './parsers/index.js';
import { GuardrailSynthesizer } from './guardrails/synthesizer.js';
import { TargetEmissions } from './generators/index.js';
import { IRValidator } from './ir/validator.js';

export interface CompileOptions {
  filename?: string;
  targets?: CompilerTarget[];
  hardenGuardrails?: boolean;
}

export class PolySkillCompiler {
  /**
   * End-to-end compilation pipeline:
   * Source Code / Spec -> AST/Parser -> Universal Skill IR -> Guardrail Synthesizer -> Multi-Target Code Generation
   */
  static compile(source: string, options: CompileOptions = {}): CompilationResult {
    const filename = options.filename || 'source.spec';
    const targets = options.targets || ['all'];
    const harden = options.hardenGuardrails !== false;
    const diagnostics: CompilationResult['diagnostics'] = [];

    // Step 1: Parse to Universal Skill IR
    let ir: SkillIR;
    try {
      ir = UniversalParser.parse(source, filename);
      diagnostics.push({
        level: 'info',
        message: `Parsed ${ir.tools.length} tools from source '${filename}' (Type: ${ir.metadata.sourceType})`
      });
    } catch (err) {
      throw new Error(`Compiler Frontend Error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Step 2: Validate IR structure
    const validation = IRValidator.validate(ir);
    for (const issue of validation.issues) {
      diagnostics.push({
        level: issue.severity === 'error' ? 'error' : 'warning',
        message: `[IR Validation] ${issue.path}: ${issue.message}`
      });
    }

    // Step 3: Security Audit
    const preAudit = GuardrailSynthesizer.audit(ir.tools, ir.guardrails);

    // Step 4: Synthesize / Harden Guardrails
    if (harden) {
      ir.tools = GuardrailSynthesizer.synthesize(ir.tools, ir.guardrails);
      diagnostics.push({
        level: 'info',
        message: `Synthesized deterministic guardrails (Path Traversal, Destructive Gate, DryRun auto-injection)`
      });
    }

    // Step 5: Post-Harden Audit & Final Safety Score
    const finalAudit = GuardrailSynthesizer.audit(ir.tools, ir.guardrails);
    ir.metadata.safetyScore = finalAudit.safetyScore;

    // Step 6: Code Generation across requested targets
    const targetFiles = TargetEmissions.emit(ir, targets);
    diagnostics.push({
      level: 'info',
      message: `Generated ${Object.keys(targetFiles).length} artifact files across targets: ${targets.join(', ')}`
    });

    return {
      ir,
      targetFiles,
      diagnostics,
      auditReport: {
        safetyScore: finalAudit.safetyScore,
        findings: finalAudit.findings.map(f => ({
          severity: f.severity,
          message: f.message,
          rule: f.rule
        }))
      }
    };
  }
}
