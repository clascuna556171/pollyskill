import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { OpenAPIParser } from '../src/parsers/openapi.js';
import { ScriptParser } from '../src/parsers/script.js';
import { ManifestParser } from '../src/parsers/manifest.js';
import { UniversalParser } from '../src/parsers/index.js';

describe('PolySkill Parsers Test Suite', () => {
  test('OpenAPIParser parses endpoints and assigns risk levels', () => {
    const rawJson = fs.readFileSync(path.resolve('examples/stripe-billing.json'), 'utf-8');
    const ir = OpenAPIParser.parse(rawJson);

    assert.equal(ir.name, 'stripe-billing-ops');
    assert.ok(ir.tools.length >= 4);

    const deleteTool = ir.tools.find(t => t.name === 'delete_customer');
    assert.ok(deleteTool, 'delete_customer tool should exist');
    assert.equal(deleteTool.riskLevel, 'destructive_write');

    const listTool = ir.tools.find(t => t.name === 'list_customer_subscriptions');
    assert.ok(listTool, 'list_customer_subscriptions tool should exist');
    assert.equal(listTool.riskLevel, 'read_only');
  });

  test('ScriptParser extracts functions, docstrings, and types from Python', () => {
    const pySource = fs.readFileSync(path.resolve('examples/billing-ops.py'), 'utf-8');
    const ir = ScriptParser.parsePython(pySource, 'billing-ops.py');

    assert.equal(ir.name, 'billing-ops');
    const refundTool = ir.tools.find(t => t.name === 'refund_charge');
    assert.ok(refundTool, 'refund_charge tool should be parsed');
    assert.equal(refundTool.parameters.properties['charge_id']?.type, 'string');
    assert.equal(refundTool.parameters.properties['amount_cents']?.type, 'integer');
    assert.ok(refundTool.parameters.required?.includes('charge_id'));

    const purgeTool = ir.tools.find(t => t.name === 'purge_customer_payment_methods');
    assert.ok(purgeTool);
    assert.equal(purgeTool.riskLevel, 'destructive_write');
  });

  test('ManifestParser correctly ingests SkillSpec YAML', () => {
    const yamlSource = fs.readFileSync(path.resolve('examples/cloud-sre.yaml'), 'utf-8');
    const ir = ManifestParser.parse(yamlSource);

    assert.equal(ir.name, 'ecs-service-sre');
    assert.equal(ir.category, 'cloud');
    assert.equal(ir.tools.length, 3);

    const scaleTool = ir.tools.find(t => t.name === 'scale_service');
    assert.ok(scaleTool);
    assert.equal(scaleTool.parameters.properties['desired_count']?.type, 'integer');
  });

  test('UniversalParser auto-detects file types accurately', () => {
    const py = UniversalParser.parse('def clean_cache(path: str):\n    pass\n', 'cleaner.py');
    assert.equal(py.metadata.sourceType, 'python');

    const json = UniversalParser.parse(fs.readFileSync('examples/stripe-billing.json', 'utf-8'));
    assert.equal(json.metadata.sourceType, 'openapi');
  });
});
