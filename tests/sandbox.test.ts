import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { SandboxRunner } from '../src/sandbox/runner.js';
import { SkillIR } from '../src/ir/types.js';

describe('PolySkill Sandbox & Security Guardrail Suite', () => {
  const sampleIR: SkillIR = {
    version: '1.0.0',
    schemaVersion: '1.0.0',
    name: 'test-skill',
    displayName: 'Test Skill',
    description: 'Sandbox verification skill',
    category: 'security',
    systemPrompt: 'Test system prompt',
    workflowInstructions: 'Test instructions',
    triggerPhrases: [],
    tools: [
      {
        id: 'read_config',
        name: 'read_config',
        description: 'Read local configuration file',
        riskLevel: 'read_only',
        parameters: {
          type: 'object',
          properties: {
            config_path: { type: 'string' }
          },
          required: ['config_path']
        },
        execution: { type: 'cli', command: 'cat' }
      },
      {
        id: 'purge_all',
        name: 'purge_all',
        description: 'Destructive purge tool',
        riskLevel: 'destructive_write',
        guardrails: { requireConfirmation: true, allowDryRun: true },
        parameters: {
          type: 'object',
          properties: {
            confirm: { type: 'boolean' },
            dryRun: { type: 'boolean' }
          },
          required: []
        },
        execution: { type: 'cli', command: 'purge' }
      }
    ],
    guardrails: {
      enablePathTraversalProtection: true,
      enableDestructiveConfirmation: true,
      enableDryRunDefault: true,
      defaultTimeoutSeconds: 30,
      blockedShellCommands: [],
      allowedFileExtensions: [],
      sanitizationRegexes: []
    },
    envRequirements: [],
    examples: [],
    metadata: {
      sourceType: 'manual',
      compiledAt: new Date().toISOString(),
      compilerVersion: '1.0.0',
      safetyScore: 95
    }
  };

  test('blocks path traversal attack attempting ../ access', () => {
    const res = SandboxRunner.simulateExecution(sampleIR, 'read_config', {
      config_path: '../../etc/passwd'
    });

    assert.equal(res.success, false);
    assert.equal(res.guardrailBlocked, true);
    assert.ok(res.blockReason?.includes('path traversal sequence'));
  });

  test('blocks command injection characters', () => {
    const res = SandboxRunner.simulateExecution(sampleIR, 'read_config', {
      config_path: 'valid.json; rm -rf /'
    });

    assert.equal(res.success, false);
    assert.equal(res.guardrailBlocked, true);
    assert.ok(res.blockReason?.includes('forbidden shell execution characters'));
  });

  test('blocks unconfirmed destructive tool invocation', () => {
    const res = SandboxRunner.simulateExecution(sampleIR, 'purge_all', {
      confirm: false,
      dryRun: false
    });

    assert.equal(res.success, false);
    assert.equal(res.guardrailBlocked, true);
    assert.ok(res.blockReason?.includes('CONFIRMATION_REQUIRED'));
  });

  test('allows destructive tool when dryRun is enabled', () => {
    const res = SandboxRunner.simulateExecution(sampleIR, 'purge_all', {
      dryRun: true
    });

    assert.equal(res.success, true);
    assert.equal(res.output?.status, 'dry_run_simulated');
  });

  test('allows destructive tool when explicitly confirmed', () => {
    const res = SandboxRunner.simulateExecution(sampleIR, 'purge_all', {
      confirm: true
    });

    assert.equal(res.success, true);
    assert.equal(res.output?.status, 'executed');
  });
});
