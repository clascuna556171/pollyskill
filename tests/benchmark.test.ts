import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { BenchmarkRunner } from '../src/benchmark/runner.js';

describe('Compiler Latency Benchmark Test Suite', () => {
  test('BenchmarkRunner executes multi-pass telemetry across fixtures', () => {
    const report = BenchmarkRunner.run(2);

    assert.ok(report.results.length >= 3, 'Benchmarks at least 3 fixtures');
    assert.ok(report.overallAverageMs > 0, 'Computes positive average latency');
    assert.ok(report.compilationsPerSecond > 0, 'Computes throughput');
    assert.ok(report.llmComparisonSpeedup > 1, 'Proves speedup factor vs cloud LLM roundtrip');

    for (const item of report.results) {
      assert.ok(item.fixture);
      assert.ok(item.toolsExtracted > 0, `${item.fixture} should have extracted tools`);
      assert.ok(item.artifactsEmitted >= 8, `${item.fixture} should emit artifacts`);
      assert.ok(item.timing.totalMs > 0);
      assert.ok(item.timing.parseMs >= 0);
      assert.ok(item.timing.codegenMs >= 0);
    }
  });
});
