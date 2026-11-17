import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { createInterface } from 'node:readline/promises';
import pc from 'picocolors';
import { PolySkillCompiler } from '../compiler.js';
import { GuardrailSynthesizer } from '../guardrails/synthesizer.js';
import { TargetEmissions } from '../generators/index.js';
import { SkillInstaller } from '../install/installer.js';
import { InstallTarget } from '../install/types.js';
import { CompilationResult, CompilerTarget } from '../ir/types.js';
import { NaturalLanguageSynthesizer } from '../parsers/natural.js';
import { SandboxRunner } from '../sandbox/runner.js';

export type WizardProvider = 'builtin' | 'gemini' | 'openai' | 'ollama';

export interface WizardPromptIO {
  ask(question: string): Promise<string>;
  log(line?: string): void;
  close(): void;
}

export interface WizardStarterTemplate {
  id: string;
  label: string;
  mode: 'prompt' | 'source';
  description: string;
  prompt?: string;
  filename?: string;
  source?: string;
}

export const WIZARD_TEMPLATES: WizardStarterTemplate[] = [
  {
    id: 'ui-ux-reviewer',
    label: 'UI/UX Design & Accessibility Reviewer',
    mode: 'prompt',
    description: 'Audits layouts, WCAG contrast ratios, and 44pt touch targets.',
    prompt: 'UI/UX design reviewer that checks contrast ratios, verifies 44pt touch targets, and generates structured critique reports.'
  },
  {
    id: 'security-auditor',
    label: 'Repository Secret & Security Scanner',
    mode: 'prompt',
    description: 'Scans codebases for leaked API tokens, credentials, and SSRF risks.',
    prompt: 'Security auditor that scans repositories for leaked API secrets, insecure JWT configurations, and unvalidated redirects.'
  },
  {
    id: 'python-ops',
    label: 'Python Maintenance Script (Example)',
    mode: 'source',
    description: 'Compiles a Python backup & migration script with confirm/dryRun gates.',
    filename: 'db_maintenance.py',
    source: `"""
Database Maintenance & Backup Skill
"""

def backup_database(database_name: str, output_dir: str = "./backups") -> str:
    """
    Create a compressed backup of the target database.
    :param database_name: Target database name
    :param output_dir: Directory to store the backup file
    """
    return f"{output_dir}/{database_name}.dump"

def purge_expired_snapshots(database_name: str, older_than_days: int = 30) -> bool:
    """
    Permanently delete expired database snapshots.
    :param database_name: Target database name
    :param older_than_days: Age threshold in days
    """
    return True
`
  }
];

export function createReadlineIO(): WizardPromptIO {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return {
    ask: (question: string) => rl.question(question),
    log: (line = '') => console.log(line),
    close: () => rl.close()
  };
}

export function slugifySkillName(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'custom-skill';
}

export function parseTargetSelection(raw: string): CompilerTarget[] {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed === '1' || trimmed === 'all') {
    return ['all'];
  }

  const shortcutMap: Record<string, CompilerTarget> = {
    '1': 'all',
    '2': 'antigravity',
    '3': 'mcp',
    '4': 'cursor',
    '5': 'openai',
    all: 'all',
    antigravity: 'antigravity',
    mcp: 'mcp',
    'mcp-sse': 'mcp-sse',
    cursor: 'cursor',
    openai: 'openai'
  };

  const targets = trimmed
    .split(',')
    .map(part => shortcutMap[part.trim()])
    .filter((value): value is CompilerTarget => Boolean(value));

  return targets.length > 0 ? Array.from(new Set(targets)) : ['all'];
}

export function formatNextSteps(opts: {
  sourceArg?: string;
  skillName: string;
  firstTool?: string;
  outDir?: string;
  didInstall?: boolean;
}): string[] {
  const steps: string[] = [];
  if (opts.outDir) {
    steps.push(`Inspect generated files in ${opts.outDir} (skills/${opts.skillName}/SKILL.md, mcp/${opts.skillName}/mcp-server.mjs)`);
  }
  if (opts.sourceArg && opts.firstTool) {
    steps.push(`Test a tool safely:   polyskill test "${opts.sourceArg}" --tool ${opts.firstTool} --args '{"dryRun":true}'`);
  }
  if (opts.sourceArg && !opts.didInstall) {
    steps.push(`Install to agents:    polyskill install "${opts.sourceArg}" --dry-run`);
  }
  steps.push('Open Visual Studio:   polyskill ui');
  return steps;
}

export async function compileFromWizardPrompt(options: {
  prompt: string;
  customName?: string;
  provider?: WizardProvider;
  apiKey?: string;
  targets?: CompilerTarget[];
}): Promise<CompilationResult> {
  const ir = await NaturalLanguageSynthesizer.synthesize({
    prompt: options.prompt,
    provider: options.provider || 'builtin',
    apiKey: options.apiKey
  });

  if (options.customName && options.customName.trim()) {
    const trimmed = options.customName.trim();
    ir.displayName = trimmed;
    ir.name = slugifySkillName(trimmed);
  }

  ir.tools = GuardrailSynthesizer.synthesize(ir.tools, ir.guardrails);
  const audit = GuardrailSynthesizer.audit(ir.tools, ir.guardrails);
  ir.metadata.safetyScore = audit.safetyScore;

  const targets: CompilerTarget[] =
    options.targets && options.targets.length > 0 ? options.targets : ['all'];
  const targetFiles = TargetEmissions.emit(ir, targets);

  return {
    ir,
    targetFiles,
    diagnostics: [
      { level: 'info', message: `Synthesized '${ir.displayName}' via ${options.provider || 'builtin'} synthesizer` }
    ],
    auditReport: {
      safetyScore: audit.safetyScore,
      findings: audit.findings.map(f => ({
        severity: f.severity,
        message: f.message,
        rule: f.rule
      }))
    }
  };
}

export function writeCompilationArtifacts(
  result: CompilationResult,
  outDir: string
): string[] {
  const resolvedOut = path.resolve(process.cwd(), outDir);
  const written: string[] = [];
  for (const [relPath, fileContent] of Object.entries(result.targetFiles)) {
    const fullPath = path.join(resolvedOut, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, fileContent, 'utf-8');
    written.push(fullPath);
  }
  return written;
}

export interface GuidedWizardOptions {
  io?: WizardPromptIO;
  onLaunchUi?: () => void;
}

export async function runGuidedWizard(options: GuidedWizardOptions = {}): Promise<CompilationResult | null> {
  const io = options.io || createReadlineIO();
  const shouldClose = !options.io;

  try {
    io.log(pc.cyan('\n⚡ PolySkill Guided Skill Builder'));
    io.log(pc.gray('   Create a hardened agent skill in 3 quick steps: Input -> Verify -> Save or Install.\n'));

    io.log(pc.bold('Step 1/3 — How do you want to start?'));
    io.log('  1) Describe what the skill should do in plain English (offline, $0)');
    io.log('  2) Compile an existing script or API spec (.py, .ts, .sh, .json, .yaml)');
    io.log('  3) Pick a ready-made starter example');
    io.log('  4) Open the Visual Web Studio instead (http://localhost:3456)\n');

    const modeAnswer = (await io.ask(pc.cyan('Choose [1-4] (default 1): '))).trim() || '1';

    if (modeAnswer === '4') {
      io.log(pc.green('\nLaunching PolySkill Web Studio...'));
      if (options.onLaunchUi) {
        options.onLaunchUi();
      }
      return null;
    }

    let compilation: CompilationResult;
    let sourceLabel = '';

    if (modeAnswer === '2') {
      let resolvedFile = '';
      while (!resolvedFile) {
        const fileAnswer = (await io.ask(pc.cyan('\nPath to source file (e.g. examples/billing-ops.py): '))).trim();
        if (!fileAnswer) {
          io.log(pc.yellow('Please enter a file path, or press Ctrl+C to cancel.'));
          continue;
        }
        const candidate = path.resolve(process.cwd(), fileAnswer);
        if (!fs.existsSync(candidate)) {
          io.log(pc.red(`File not found: ${candidate}`));
          continue;
        }
        resolvedFile = candidate;
      }

      const targetAnswer = await io.ask(
        pc.cyan('Targets [1=All (default), 2=Antigravity, 3=MCP, 4=Cursor, 5=OpenAI]: ')
      );
      const targets = parseTargetSelection(targetAnswer);
      const content = fs.readFileSync(resolvedFile, 'utf-8');
      compilation = PolySkillCompiler.compile(content, {
        filename: path.basename(resolvedFile),
        targets,
        hardenGuardrails: true
      });
      sourceLabel = path.relative(process.cwd(), resolvedFile) || resolvedFile;
    } else if (modeAnswer === '3') {
      io.log(pc.bold('\nStarter Examples:'));
      WIZARD_TEMPLATES.forEach((tpl, idx) => {
        io.log(`  ${idx + 1}) ${pc.white(tpl.label)} — ${pc.gray(tpl.description)}`);
      });
      const tplChoice = (await io.ask(pc.cyan(`\nChoose example [1-${WIZARD_TEMPLATES.length}] (default 1): `))).trim();
      const index = Math.max(0, Math.min(WIZARD_TEMPLATES.length - 1, (parseInt(tplChoice, 10) || 1) - 1));
      const selected = WIZARD_TEMPLATES[index];

      const targetAnswer = await io.ask(
        pc.cyan('Targets [1=All (default), 2=Antigravity, 3=MCP, 4=Cursor, 5=OpenAI]: ')
      );
      const targets = parseTargetSelection(targetAnswer);

      if (selected.mode === 'source' && selected.source && selected.filename) {
        compilation = PolySkillCompiler.compile(selected.source, {
          filename: selected.filename,
          targets,
          hardenGuardrails: true
        });
      } else {
        compilation = await compileFromWizardPrompt({
          prompt: selected.prompt || selected.description,
          targets
        });
      }
    } else {
      let prompt = '';
      while (!prompt) {
        prompt = (await io.ask(pc.cyan('\nDescribe what your skill should do: '))).trim();
        if (!prompt) {
          io.log(pc.yellow('Please enter a short description of the skill.'));
        }
      }

      const customName = (await io.ask(pc.cyan('Optional skill name (press Enter to auto-name): '))).trim();
      const targetAnswer = await io.ask(
        pc.cyan('Targets [1=All (default), 2=Antigravity, 3=MCP, 4=Cursor, 5=OpenAI]: ')
      );
      const targets = parseTargetSelection(targetAnswer);

      compilation = await compileFromWizardPrompt({
        prompt,
        customName: customName || undefined,
        targets
      });
    }

    // Step 2: Review capabilities and safety
    io.log(pc.bold(`\nStep 2/3 — Review "${compilation.ir.displayName}" (${compilation.ir.name})`));
    io.log(`  Safety Score: ${pc.green(`${compilation.auditReport.safetyScore}/100`)}`);
    io.log(`  Tools (${compilation.ir.tools.length}):`);
    for (const tool of compilation.ir.tools) {
      io.log(`    • ${pc.white(tool.name)} ${pc.gray(`[${tool.riskLevel}]`)} — ${tool.description}`);
    }

    const firstTool = compilation.ir.tools[0]?.name;
    if (firstTool) {
      const testAnswer = (await io.ask(pc.cyan(`\nRun a quick dry-run sandbox check on "${firstTool}"? [y/N]: `)))
        .trim()
        .toLowerCase();
      if (testAnswer === 'y' || testAnswer === 'yes') {
        const sim = SandboxRunner.simulateExecution(compilation.ir, firstTool, { dryRun: true, confirm: true });
        if (sim.guardrailBlocked) {
          io.log(pc.red(`  ✖ Blocked: ${sim.blockReason}`));
        } else if (sim.success) {
          io.log(pc.green(`  ✔ Sandbox dry-run passed in ${sim.durationMs}ms`));
        } else {
          io.log(pc.yellow(`  ⚠ Simulation notice: ${sim.blockReason || 'check parameters'}`));
        }
      }
    }

    // Step 3: Save, Install, or Preview
    io.log(pc.bold('\nStep 3/3 — Where should this skill go?'));
    io.log('  1) Save compiled files to ./dist (default)');
    io.log('  2) Save to a custom folder');
    io.log('  3) Install directly into local agents (Antigravity, Claude MCP, Cursor)');
    io.log('  4) Preview SKILL.md here without writing files');

    const destAnswer = (await io.ask(pc.cyan('Choose [1-4] (default 1): '))).trim() || '1';
    let outDir: string | undefined;
    let didInstall = false;

    if (destAnswer === '3') {
      const dryAnswer = (await io.ask(pc.cyan('Preview install paths first (dry-run)? [Y/n]: '))).trim().toLowerCase();
      const dryRun = dryAnswer !== 'n' && dryAnswer !== 'no';
      const installRes = SkillInstaller.install(compilation, {
        targets: ['all'] as InstallTarget[],
        scope: 'global',
        dryRun
      });
      didInstall = !dryRun;
      for (const item of installRes.installedItems) {
        io.log(`  ${dryRun ? pc.yellow('[DRY-RUN]') : pc.green('✔')} ${item.target.toUpperCase()}: ${item.path}`);
      }
      if (dryRun) {
        const confirmInstall = (await io.ask(pc.cyan('Write these files now? [y/N]: '))).trim().toLowerCase();
        if (confirmInstall === 'y' || confirmInstall === 'yes') {
          const realRes = SkillInstaller.install(compilation, {
            targets: ['all'] as InstallTarget[],
            scope: 'global',
            dryRun: false
          });
          didInstall = true;
          for (const item of realRes.installedItems) {
            io.log(`  ${pc.green('✔ [MOUNTED]')} ${item.target.toUpperCase()}: ${item.path}`);
          }
        }
      }
    } else if (destAnswer === '4') {
      const md = compilation.targetFiles[`skills/${compilation.ir.name}/SKILL.md`];
      io.log('\n' + (md || 'SKILL.md was not generated for the selected targets.'));
    } else {
      outDir = destAnswer === '2'
        ? ((await io.ask(pc.cyan('Output directory (default ./dist): '))).trim() || './dist')
        : './dist';
      const written = writeCompilationArtifacts(compilation, outDir);
      io.log(pc.green(`\n✔ Saved ${written.length} files to ${outDir}:`));
      for (const filePath of written) {
        io.log(`  • ${path.relative(process.cwd(), filePath)}`);
      }
    }

    const nextSteps = formatNextSteps({
      sourceArg: sourceLabel || undefined,
      skillName: compilation.ir.name,
      firstTool,
      outDir,
      didInstall
    });
    io.log(pc.bold('\nNext steps:'));
    for (const step of nextSteps) {
      io.log(`  • ${step}`);
    }
    io.log();

    return compilation;
  } finally {
    if (shouldClose) {
      io.close();
    }
  }
}
