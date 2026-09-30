import * as fs from 'node:fs';
import * as path from 'node:path';
import { UniversalParser } from '../parsers/index.js';
import { IRValidator } from '../ir/validator.js';
import { GuardrailSynthesizer } from '../guardrails/synthesizer.js';
import { TargetEmissions } from '../generators/index.js';

export interface PhaseTiming {
  parseMs: number;
  validateMs: number;
  auditMs: number;
  synthesisMs: number;
  codegenMs: number;
  totalMs: number;
}

export interface BenchmarkItemResult {
  fixture: string;
  sourceType: string;
  toolsExtracted: number;
  artifactsEmitted: number;
  timing: PhaseTiming;
  memoryDeltaKb: number;
}

export interface BenchmarkReport {
  results: BenchmarkItemResult[];
  overallAverageMs: number;
  compilationsPerSecond: number;
  llmComparisonSpeedup: number; // vs average ~3500ms LLM roundtrip
}

export class BenchmarkRunner {
  /**
   * Runs high-resolution compiler telemetry benchmarks across real-world fixtures.
   */
  static run(iterations = 5): BenchmarkReport {
    const fixtures = [
      { name: 'billing-ops.py', path: 'examples/billing-ops.py' },
      { name: 'stripe-billing.json', path: 'examples/stripe-billing.json' },
      { name: 'docker-cleanup.sh', path: 'examples/docker-cleanup.sh' },
      { name: 'cloud-sre.yaml', path: 'examples/cloud-sre.yaml' }
    ];

    const results: BenchmarkItemResult[] = [];
    let totalTimeAccumulator = 0;

    for (const fixture of fixtures) {
      const fullPath = path.resolve(process.cwd(), fixture.path);
      if (!fs.existsSync(fullPath)) continue;

      const sourceContent = fs.readFileSync(fullPath, 'utf-8');

      // Warmup run
      UniversalParser.parse(sourceContent, fixture.name);

      let sumParse = 0;
      let sumValidate = 0;
      let sumAudit = 0;
      let sumSynthesis = 0;
      let sumCodegen = 0;
      let sumTotal = 0;
      let toolsCount = 0;
      let artifactsCount = 0;
      let detectedSourceType = 'unknown';

      const memStart = process.memoryUsage().heapUsed;

      for (let i = 0; i < iterations; i++) {
        const t0 = performance.now();
        const ir = UniversalParser.parse(sourceContent, fixture.name);
        const t1 = performance.now();

        IRValidator.validate(ir);
        const t2 = performance.now();

        GuardrailSynthesizer.audit(ir.tools, ir.guardrails);
        const t3 = performance.now();

        ir.tools = GuardrailSynthesizer.synthesize(ir.tools, ir.guardrails);
        const t4 = performance.now();

        const files = TargetEmissions.emit(ir, ['all']);
        const t5 = performance.now();

        sumParse += (t1 - t0);
        sumValidate += (t2 - t1);
        sumAudit += (t3 - t2);
        sumSynthesis += (t4 - t3);
        sumCodegen += (t5 - t4);
        sumTotal += (t5 - t0);

        toolsCount = ir.tools.length;
        artifactsCount = Object.keys(files).length;
        detectedSourceType = ir.metadata.sourceType;
      }

      const memEnd = process.memoryUsage().heapUsed;
      const avgTotal = sumTotal / iterations;
      totalTimeAccumulator += avgTotal;

      results.push({
        fixture: fixture.name,
        sourceType: detectedSourceType,
        toolsExtracted: toolsCount,
        artifactsEmitted: artifactsCount,
        timing: {
          parseMs: Math.round((sumParse / iterations) * 100) / 100,
          validateMs: Math.round((sumValidate / iterations) * 100) / 100,
          auditMs: Math.round((sumAudit / iterations) * 100) / 100,
          synthesisMs: Math.round((sumSynthesis / iterations) * 100) / 100,
          codegenMs: Math.round((sumCodegen / iterations) * 100) / 100,
          totalMs: Math.round(avgTotal * 100) / 100
        },
        memoryDeltaKb: Math.round(Math.max(0, (memEnd - memStart) / 1024))
      });
    }

    const overallAverageMs = Math.round((totalTimeAccumulator / Math.max(1, results.length)) * 100) / 100;
    const compilationsPerSecond = Math.round(1000 / Math.max(0.1, overallAverageMs));
    const llmComparisonSpeedup = Math.round(3500 / Math.max(0.1, overallAverageMs));

    return {
      results,
      overallAverageMs,
      compilationsPerSecond,
      llmComparisonSpeedup
    };
  }
}
