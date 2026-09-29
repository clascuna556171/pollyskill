import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { PolySkillCompiler } from '../src/compiler.js';

describe('PolySkill Compiler End-to-End Suite', () => {
  test('compiles Python source across all target formats', () => {
    const pySource = fs.readFileSync('examples/billing-ops.py', 'utf-8');
    const result = PolySkillCompiler.compile(pySource, {
      filename: 'billing-ops.py',
      targets: ['all'],
      hardenGuardrails: true
    });

    assert.equal(result.ir.name, 'billing-ops');
    assert.ok(result.auditReport.safetyScore >= 80);

    const emitted = Object.keys(result.targetFiles);
    
    // Check Antigravity output
    assert.ok(emitted.includes('skills/billing-ops/SKILL.md'));
    assert.ok(result.targetFiles['skills/billing-ops/SKILL.md'].includes('name: billing-ops'));

    // Check MCP Server output
    assert.ok(emitted.includes('mcp/billing-ops/mcp-server.mjs'));
    assert.ok(result.targetFiles['mcp/billing-ops/mcp-server.mjs'].includes('jsonrpc: "2.0"'));

    // Check Cursor Rules output
    assert.ok(emitted.includes('cursor/billing-ops/.cursorrules'));

    // Check OpenAI Tools output
    assert.ok(emitted.includes('api-tools/billing-ops/openai-tools.json'));
    const parsedOpenAI = JSON.parse(result.targetFiles['api-tools/billing-ops/openai-tools.json']);
    assert.ok(Array.isArray(parsedOpenAI.tools));
  });

  test('compiles OpenAPI specification and generates valid targets', () => {
    const openApiSource = fs.readFileSync('examples/stripe-billing.json', 'utf-8');
    const result = PolySkillCompiler.compile(openApiSource, {
      filename: 'stripe-billing.json',
      targets: ['all']
    });

    assert.equal(result.ir.name, 'stripe-billing-ops');
    assert.ok(result.ir.tools.length >= 4);
    assert.ok(result.targetFiles['skills/stripe-billing-ops/SKILL.md']);
  });
});
