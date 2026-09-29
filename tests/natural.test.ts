import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { NaturalLanguageSynthesizer } from '../src/parsers/natural.js';

describe('NaturalLanguageSynthesizer Test Suite', () => {
  test('synthesizes UI/UX Design skill with HIG and contrast tools', async () => {
    const ir = await NaturalLanguageSynthesizer.synthesize({
      prompt: 'UI/UX design auditor that checks contrast, verifies 44pt touch targets against Apple HIG, and creates critique reports.'
    });

    assert.equal(ir.displayName, 'UI/UX Design & HIG Reviewer');
    assert.equal(ir.category, 'developer_tool');
    assert.ok(ir.tools.length >= 4);

    const contrastTool = ir.tools.find(t => t.name === 'audit_contrast_and_typography');
    assert.ok(contrastTool, 'audit_contrast_and_typography tool must be generated');
    assert.equal(contrastTool.riskLevel, 'read_only');
    assert.ok(contrastTool.parameters.required?.includes('textColor'));

    const higTool = ir.tools.find(t => t.name === 'check_apple_hig_compliance');
    assert.ok(higTool, 'check_apple_hig_compliance tool must be generated');
  });

  test('synthesizes security scanning skill from plain text', async () => {
    const ir = await NaturalLanguageSynthesizer.synthesize({
      prompt: 'Scan our codebase for leaked API keys, tokens, and hardcoded credentials'
    });

    assert.equal(ir.category, 'security');
    assert.ok(ir.tools.length >= 3);
  });

  test('synthesizes arbitrary domain skill', async () => {
    const ir = await NaturalLanguageSynthesizer.synthesize({
      prompt: 'Automated video transcript summarizer and chapter generator'
    });

    assert.ok(ir.tools.length >= 3);
    assert.ok(ir.workflowInstructions.length > 10);
  });
});
