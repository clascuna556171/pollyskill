import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  compileFromWizardPrompt,
  formatNextSteps,
  parseTargetSelection,
  runGuidedWizard,
  slugifySkillName,
  WizardPromptIO
} from '../src/cli/wizard.js';

function createMockIO(answers: string[]): { io: WizardPromptIO; logs: string[] } {
  const queue = [...answers];
  const logs: string[] = [];
  return {
    logs,
    io: {
      async ask(_question: string): Promise<string> {
        return queue.shift() ?? '';
      },
      log(line = ''): void {
        logs.push(line);
      },
      close(): void {
        // no-op for mock
      }
    }
  };
}

describe('CLI Guided UX & Wizard Test Suite', () => {
  test('slugifySkillName normalizes arbitrary display names', () => {
    assert.equal(slugifySkillName('My Billing Helper!'), 'my-billing-helper');
    assert.equal(slugifySkillName('   '), 'custom-skill');
  });

  test('parseTargetSelection maps numeric shortcuts and comma lists', () => {
    assert.deepEqual(parseTargetSelection(''), ['all']);
    assert.deepEqual(parseTargetSelection('1'), ['all']);
    assert.deepEqual(parseTargetSelection('2,3'), ['antigravity', 'mcp']);
    assert.deepEqual(parseTargetSelection('cursor, openai'), ['cursor', 'openai']);
  });

  test('formatNextSteps provides actionable follow-up commands', () => {
    const steps = formatNextSteps({
      sourceArg: 'examples/billing-ops.py',
      skillName: 'billing-ops',
      firstTool: 'refund_charge',
      outDir: './dist',
      didInstall: false
    });
    assert.ok(steps.some(s => s.includes('polyskill test')));
    assert.ok(steps.some(s => s.includes('polyskill install')));
    assert.ok(steps.some(s => s.includes('polyskill ui')));
  });

  test('compileFromWizardPrompt applies custom name and synthesizes guardrails', async () => {
    const result = await compileFromWizardPrompt({
      prompt: 'Audit SQL queries and check slow Postgres indexes',
      customName: 'Postgres Query Doctor',
      targets: ['antigravity', 'mcp']
    });

    assert.equal(result.ir.displayName, 'Postgres Query Doctor');
    assert.equal(result.ir.name, 'postgres-query-doctor');
    assert.ok(result.auditReport.safetyScore >= 80);
    assert.ok(result.targetFiles['skills/postgres-query-doctor/SKILL.md']);
    assert.ok(result.targetFiles['mcp/postgres-query-doctor/mcp-server.mjs']);
  });

  test('runGuidedWizard creates skill from prompt and previews SKILL.md without writing files', async () => {
    const { io, logs } = createMockIO([
      '1',                                        // plain English
      'Review UI layouts for contrast and WCAG',  // prompt
      'Contrast Inspector',                       // custom name
      '2',                                        // antigravity only
      'n',                                        // skip dry-run
      '4'                                         // preview SKILL.md
    ]);

    const result = await runGuidedWizard({ io });
    assert.ok(result);
    assert.equal(result.ir.name, 'contrast-inspector');
    const output = logs.join('\n');
    assert.ok(output.includes('name: contrast-inspector'));
    assert.ok(output.includes('Next steps:'));
  });

  test('runGuidedWizard compiles an existing file and writes artifacts to custom directory', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyskill-wizard-'));
    try {
      const { io } = createMockIO([
        '2',                          // existing file
        'examples/billing-ops.py',    // source path
        '1',                          // all targets
        'y',                          // run quick sandbox test
        '2',                          // custom folder
        tempDir                       // output directory
      ]);

      const result = await runGuidedWizard({ io });
      assert.ok(result);
      assert.ok(fs.existsSync(path.join(tempDir, 'skills', result.ir.name, 'SKILL.md')));
      assert.ok(fs.existsSync(path.join(tempDir, 'mcp', result.ir.name, 'mcp-server.mjs')));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('runGuidedWizard triggers UI launch callback when user picks option 4', async () => {
    let launched = false;
    const { io } = createMockIO(['4']);
    const result = await runGuidedWizard({
      io,
      onLaunchUi: () => {
        launched = true;
      }
    });
    assert.equal(result, null);
    assert.equal(launched, true);
  });

  test('CLI --help includes Quick Start and init command', () => {
    const tsxCli = path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const helpOutput = execFileSync(process.execPath, [tsxCli, 'src/cli/index.ts', '--help'], {
      encoding: 'utf-8'
    });
    assert.ok(helpOutput.includes('Quick Start'));
    assert.ok(helpOutput.includes('init'));
  });
});
