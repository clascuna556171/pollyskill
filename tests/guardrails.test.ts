import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { GuardrailSynthesizer } from '../src/guardrails/synthesizer.js';
import { SkillTool } from '../src/ir/types.js';

describe('Guardrail Synthesizer & Audit Test Suite', () => {
  const mockTools: SkillTool[] = [
    {
      id: 'delete_database',
      name: 'delete_database',
      description: 'Purge target database table permanently',
      riskLevel: 'destructive_write',
      parameters: {
        type: 'object',
        properties: {
          table_name: { type: 'string' }
        },
        required: ['table_name']
      },
      execution: { type: 'cli', command: 'drop table' }
    },
    {
      id: 'get_status',
      name: 'get_status',
      description: 'Read system health status',
      riskLevel: 'read_only',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      },
      execution: { type: 'cli', command: 'status' }
    }
  ];

  test('audit flags missing confirmation on destructive tool', () => {
    const audit = GuardrailSynthesizer.audit(mockTools);
    assert.ok(audit.safetyScore < 100);
    assert.ok(audit.findings.some(f => f.rule === 'MISSING_DESTRUCTIVE_CONFIRMATION'));
  });

  test('synthesize auto-injects dryRun and confirm parameters', () => {
    const hardened = GuardrailSynthesizer.synthesize(mockTools);
    const deleteHardened = hardened.find(t => t.name === 'delete_database');

    assert.ok(deleteHardened);
    assert.ok(deleteHardened.parameters.properties['dryRun'], 'dryRun property must be injected');
    assert.ok(deleteHardened.parameters.properties['confirm'], 'confirm property must be injected');
    assert.equal(deleteHardened.guardrails?.requireConfirmation, true);

    const postAudit = GuardrailSynthesizer.audit(hardened);
    assert.ok(postAudit.safetyScore >= 90);
  });
});
