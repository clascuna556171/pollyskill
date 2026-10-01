import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { CredentialGuardrail } from '../src/guardrails/credential.js';
import { GuardrailSynthesizer } from '../src/guardrails/synthesizer.js';
import { SandboxRunner } from '../src/sandbox/runner.js';
import { SkillIR, SkillTool } from '../src/ir/types.js';

describe('Credential & PII Guardrails Test Suite', () => {
  test('CredentialGuardrail blocks AWS Access Keys', () => {
    const check = CredentialGuardrail.evaluateInput('AKIAIOSFODNN7EXAMPLE');
    assert.strictEqual(check.blocked, true);
    assert.strictEqual(check.matchedType, 'AWS_ACCESS_KEY');
  });

  test('CredentialGuardrail blocks GitHub Personal Access Tokens', () => {
    const check = CredentialGuardrail.evaluateInput('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
    assert.strictEqual(check.blocked, true);
    assert.strictEqual(check.matchedType, 'GITHUB_TOKEN');
  });

  test('CredentialGuardrail blocks OpenAI Secret Keys', () => {
    const check = CredentialGuardrail.evaluateInput('sk-1234567890abcdefghijklmnopqrstuvwxyz');
    assert.strictEqual(check.blocked, true);
    assert.strictEqual(check.matchedType, 'OPENAI_API_KEY');
  });

  test('CredentialGuardrail blocks RSA and OpenSSH Private Keys', () => {
    const check = CredentialGuardrail.evaluateInput('-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----');
    assert.strictEqual(check.blocked, true);
    assert.strictEqual(check.matchedType, 'PRIVATE_KEY');
  });

  test('CredentialGuardrail blocks Bearer JWT tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const check = CredentialGuardrail.evaluateInput(jwt);
    assert.strictEqual(check.blocked, true);
    assert.strictEqual(check.matchedType, 'JWT_BEARER');
  });

  test('CredentialGuardrail blocks Social Security and Credit Card numbers', () => {
    const ssnCheck = CredentialGuardrail.evaluateInput('123-45-6789');
    assert.strictEqual(ssnCheck.blocked, true);
    assert.strictEqual(ssnCheck.matchedType, 'PII_SSN');

    const cardCheck = CredentialGuardrail.evaluateInput('4532-1234-5678-9012');
    assert.strictEqual(cardCheck.blocked, true);
    assert.strictEqual(cardCheck.matchedType, 'PII_CREDIT_CARD');
  });

  test('CredentialGuardrail allows safe arbitrary strings and numbers', () => {
    const safeCheck = CredentialGuardrail.evaluateInput('production-cluster-us-east-1');
    assert.strictEqual(safeCheck.blocked, false);
  });

  test('CredentialGuardrail recursively redacts secrets from output objects', () => {
    const rawOutput = {
      status: 'success',
      data: {
        apiKey: 'sk-abcdefghijklmnopqrstuvwxyz123456',
        awsKey: 'AKIAIOSFODNN7EXAMPLE',
        safeData: 'hello world'
      },
      list: ['clean', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789']
    };

    const redacted = CredentialGuardrail.redactOutput(rawOutput);
    assert.ok(!redacted.data.apiKey.includes('sk-abcdef'));
    assert.ok(redacted.data.apiKey.includes('[REDACTED_OPENAI_KEY]'));
    assert.ok(redacted.data.awsKey.includes('[REDACTED_AWS_KEY]'));
    assert.ok(redacted.list[1].includes('[REDACTED_GITHUB_TOKEN]'));
    assert.strictEqual(redacted.data.safeData, 'hello world');
  });

  test('GuardrailSynthesizer.audit() penalizes unprotected credential parameters', () => {
    const tool: SkillTool = {
      id: 'store_token',
      name: 'store_token',
      description: 'Store API secret in database',
      riskLevel: 'idempotent_write',
      parameters: {
        type: 'object',
        properties: {
          auth_token: { type: 'string', description: 'API authentication secret' }
        },
        required: ['auth_token']
      },
      execution: { type: 'cli' }
    };

    const audit = GuardrailSynthesizer.audit([tool]);
    assert.ok(audit.safetyScore <= 80, 'Score should be penalized for unprotected credential parameter');
    const finding = audit.findings.find(f => f.rule === 'UNPROTECTED_CREDENTIAL_PARAMETER');
    assert.ok(finding, 'Audit should find UNPROTECTED_CREDENTIAL_PARAMETER');
  });

  test('GuardrailSynthesizer.synthesize() hardens tools with credential leak protection', () => {
    const tool: SkillTool = {
      id: 'store_token',
      name: 'store_token',
      description: 'Store API secret in database',
      riskLevel: 'idempotent_write',
      parameters: {
        type: 'object',
        properties: {
          auth_token: { type: 'string', description: 'API authentication secret' }
        },
        required: ['auth_token']
      },
      execution: { type: 'cli' }
    };

    const hardened = GuardrailSynthesizer.synthesize([tool]);
    assert.strictEqual(hardened[0].guardrails?.blockCredentialLeak, true);
    assert.strictEqual(hardened[0].guardrails?.redactCredentialOutput, true);

    const postAudit = GuardrailSynthesizer.audit(hardened);
    assert.strictEqual(postAudit.safetyScore, 100, 'Hardened tool should pass with safetyScore 100');
  });

  test('SandboxRunner blocks simulated tool execution attempting credential injection', () => {
    const ir: SkillIR = {
      version: '1.0.0',
      schemaVersion: '1.0.0',
      name: 'auth-manager',
      displayName: 'Auth Manager',
      description: 'Manages credentials',
      category: 'security',
      systemPrompt: '',
      workflowInstructions: '',
      triggerPhrases: [],
      envRequirements: [],
      examples: [],
      guardrails: {
        enablePathTraversalProtection: true,
        enableDestructiveConfirmation: true,
        enableDryRunDefault: true,
        defaultTimeoutSeconds: 30,
        blockedShellCommands: [],
        allowedFileExtensions: [],
        sanitizationRegexes: []
      },
      tools: [
        {
          id: 'test_auth',
          name: 'test_auth',
          description: 'Test authentication',
          riskLevel: 'read_only',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string' }
            }
          },
          execution: { type: 'cli' }
        }
      ],
      metadata: {
        sourceType: 'manual',
        compiledAt: new Date().toISOString(),
        compilerVersion: '1.0.0',
        safetyScore: 100
      }
    };

    const result = SandboxRunner.simulateExecution(ir, 'test_auth', {
      target: 'AKIAIOSFODNN7EXAMPLE'
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.guardrailBlocked, true);
    assert.ok(result.blockReason?.includes('sensitive credential'));
  });
});
