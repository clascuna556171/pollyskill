import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { NetworkGuardrail } from '../src/guardrails/network.js';
import { GuardrailSynthesizer } from '../src/guardrails/synthesizer.js';
import { SandboxRunner } from '../src/sandbox/runner.js';
import { SkillIR, SkillTool } from '../src/ir/types.js';

describe('Network & SSRF Guardrails Test Suite', () => {
  test('NetworkGuardrail blocks cloud metadata endpoints (IMDS)', () => {
    const awsResult = NetworkGuardrail.evaluateTarget('http://169.254.169.254/latest/meta-data/');
    assert.strictEqual(awsResult.blocked, true);
    assert.ok(awsResult.reason?.includes('Cloud Instance Metadata'));

    const gcpResult = NetworkGuardrail.evaluateTarget('http://metadata.google.internal/computeMetadata/v1/');
    assert.strictEqual(gcpResult.blocked, true);
  });

  test('NetworkGuardrail blocks RFC 1918 private IPv4 addresses', () => {
    // 10.0.0.0/8
    assert.strictEqual(NetworkGuardrail.evaluateTarget('http://10.0.1.25/status').blocked, true);
    // 172.16.0.0/12
    assert.strictEqual(NetworkGuardrail.evaluateTarget('https://172.20.10.2:8443/api').blocked, true);
    // 192.168.0.0/16
    assert.strictEqual(NetworkGuardrail.evaluateTarget('http://192.168.1.1/setup').blocked, true);
  });

  test('NetworkGuardrail blocks localhost and loopback targets', () => {
    assert.strictEqual(NetworkGuardrail.evaluateTarget('http://localhost:3000/internal').blocked, true);
    assert.strictEqual(NetworkGuardrail.evaluateTarget('http://127.0.0.1:8080').blocked, true);
    assert.strictEqual(NetworkGuardrail.evaluateTarget('http://0.0.0.0:9000').blocked, true);
    assert.strictEqual(NetworkGuardrail.evaluateTarget('http://[::1]:8080').blocked, true);
  });

  test('NetworkGuardrail allows legitimate public endpoints', () => {
    assert.strictEqual(NetworkGuardrail.evaluateTarget('https://api.stripe.com/v1/charges').blocked, false);
    assert.strictEqual(NetworkGuardrail.evaluateTarget('https://api.github.com/repos/org/repo').blocked, false);
    assert.strictEqual(NetworkGuardrail.evaluateTarget('https://status.datadoghq.com').blocked, false);
  });

  test('GuardrailSynthesizer audits tools with unconstrained URL inputs', () => {
    const webhookTool: SkillTool = {
      id: 'send_webhook',
      name: 'send_webhook',
      description: 'Sends a payload to a target webhook URL',
      riskLevel: 'idempotent_write',
      parameters: {
        type: 'object',
        properties: {
          webhookUrl: { type: 'string', description: 'Destination webhook URL' }
        },
        required: ['webhookUrl']
      },
      execution: { type: 'cli', command: 'curl' }
    };

    const audit = GuardrailSynthesizer.audit([webhookTool]);
    const finding = audit.findings.find(f => f.rule === 'UNCONSTRAINED_NETWORK_URL_INPUT');
    assert.ok(finding, 'Audit should flag UNCONSTRAINED_NETWORK_URL_INPUT');

    const hardened = GuardrailSynthesizer.synthesize([webhookTool]);
    assert.strictEqual(hardened[0].guardrails?.blockPrivateNetworks, true);
  });

  test('SandboxRunner blocks simulated tool execution attempting SSRF to AWS metadata', () => {
    const mockIR: SkillIR = {
      name: 'webhook-caller',
      displayName: 'Webhook Caller',
      description: 'Dispatches webhooks',
      version: '1.0.0',
      schemaVersion: '1.0.0',
      category: 'developer_tool',
      systemPrompt: 'You have access to webhook tools.',
      triggerPhrases: ['call webhook'],
      workflowInstructions: 'Call the webhook URL',
      tools: [
        {
          id: 'dispatch',
          name: 'dispatch',
          description: 'Dispatch webhook',
          riskLevel: 'read_only',
          parameters: {
            type: 'object',
            properties: {
              targetUrl: { type: 'string', description: 'URL to ping' }
            },
            required: ['targetUrl']
          },
          execution: { type: 'cli', command: 'curl' },
          guardrails: { blockPrivateNetworks: true }
        }
      ],
      envRequirements: [],
      examples: [],
      guardrails: {
        enablePathTraversalProtection: true,
        enableDestructiveConfirmation: true,
        enableDryRunDefault: true,
        enableSSRFProtection: true,
        defaultTimeoutSeconds: 30,
        blockedShellCommands: [],
        allowedFileExtensions: [],
        sanitizationRegexes: []
      },
      metadata: {
        sourceType: 'manual',
        compiledAt: new Date().toISOString(),
        compilerVersion: '1.0.0',
        safetyScore: 90
      }
    };

    // 1. SSRF target -> blocked
    const attackResult = SandboxRunner.simulateExecution(mockIR, 'dispatch', {
      targetUrl: 'http://169.254.169.254/latest/meta-data/'
    });
    assert.strictEqual(attackResult.guardrailBlocked, true);
    assert.ok(attackResult.blockReason?.includes('network SSRF boundary'));

    // 2. Safe target -> allowed
    const safeResult = SandboxRunner.simulateExecution(mockIR, 'dispatch', {
      targetUrl: 'https://api.github.com/zen'
    });
    assert.strictEqual(safeResult.guardrailBlocked, false);
    assert.strictEqual(safeResult.success, true);
  });
});
