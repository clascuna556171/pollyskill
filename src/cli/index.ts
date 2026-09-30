#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { PolySkillCompiler } from '../compiler.js';
import { SandboxRunner } from '../sandbox/runner.js';
import { UniversalParser } from '../parsers/index.js';
import { GuardrailSynthesizer } from '../guardrails/synthesizer.js';
import { CompilerTarget } from '../ir/types.js';
import { startWebServer } from '../ui/server.js';
import { SkillInstaller } from '../install/installer.js';
import { InstallTarget, InstallScope } from '../install/types.js';
import { BenchmarkRunner } from '../benchmark/runner.js';

const program = new Command();

program
  .name('polyskill')
  .description('Universal static compiler for Agent Skills (Google Antigravity, MCP, Cursor, OpenAI)')
  .version('1.0.0');

// Command 1: compile
program
  .command('compile')
  .description('Compile a source file into agent skills across multiple targets')
  .argument('<source>', 'Path to source file (Python script, TypeScript file, OpenAPI JSON/YAML, or SkillSpec YAML)')
  .option('-t, --targets <targets>', 'Comma-separated target list (antigravity, mcp, cursor, openai, all)', 'all')
  .option('-o, --out <dir>', 'Output destination directory', './dist')
  .option('--no-harden', 'Disable automated guardrail synthesis')
  .action((sourcePath: string, options: { targets: string; out: string; harden: boolean }) => {
    try {
      const resolvedPath = path.resolve(process.cwd(), sourcePath);
      if (!fs.existsSync(resolvedPath)) {
        console.error(pc.red(`\n[ERROR] Source file not found: ${resolvedPath}`));
        process.exit(1);
      }

      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const filename = path.basename(resolvedPath);
      const targets = options.targets.split(',').map(t => t.trim()) as CompilerTarget[];

      console.log(pc.cyan(`\n⚡ PolySkill Compiler v1.0.0`));
      console.log(pc.gray(`   Source:  ${pc.white(filename)}`));
      console.log(pc.gray(`   Targets: ${pc.white(targets.join(', '))}`));
      console.log(pc.gray(`   Output:  ${pc.white(options.out)}\n`));

      const startTime = performance.now();
      const result = PolySkillCompiler.compile(content, {
        filename,
        targets,
        hardenGuardrails: options.harden
      });

      // Write files to out directory
      const outDir = path.resolve(process.cwd(), options.out);
      for (const [relPath, fileContent] of Object.entries(result.targetFiles)) {
        const fullPath = path.join(outDir, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, fileContent, 'utf-8');
        console.log(pc.green(`  ✔ Emitted: `) + pc.white(path.relative(process.cwd(), fullPath)));
      }

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

      console.log(`\n${pc.bold('Compilation Summary:')}`);
      console.log(`  • Skill Name:   ${pc.bold(pc.magenta(result.ir.displayName))} (${pc.gray(result.ir.name)})`);
      console.log(`  • Tools Count:  ${pc.bold(pc.yellow(String(result.ir.tools.length)))} tools extracted`);
      console.log(`  • Safety Score: ${result.auditReport.safetyScore >= 80 ? pc.green(pc.bold(`${result.auditReport.safetyScore}/100`)) : pc.yellow(pc.bold(`${result.auditReport.safetyScore}/100`))}`);
      console.log(`  • Artifacts:    ${pc.bold(String(Object.keys(result.targetFiles).length))} files in ${elapsed}s\n`);

      if (result.auditReport.findings.length > 0) {
        console.log(pc.bold('Security Audit Findings:'));
        for (const finding of result.auditReport.findings) {
          const badge = finding.severity === 'high' ? pc.red('[HIGH]') : pc.yellow('[MED]');
          console.log(`  ${badge} ${finding.rule}: ${finding.message}`);
        }
        console.log();
      }
    } catch (err: unknown) {
      console.error(pc.red(`\n[COMPILATION FAILED] ${err instanceof Error ? err.message : String(err)}\n`));
      process.exit(1);
    }
  });

// Command 2: inspect
program
  .command('inspect')
  .description('Statically inspect a source file and display its Universal Skill IR and security audit')
  .argument('<source>', 'Path to source file')
  .action((sourcePath: string) => {
    try {
      const resolvedPath = path.resolve(process.cwd(), sourcePath);
      if (!fs.existsSync(resolvedPath)) {
        console.error(pc.red(`\n[ERROR] Source file not found: ${resolvedPath}`));
        process.exit(1);
      }

      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const filename = path.basename(resolvedPath);

      console.log(pc.cyan(`\n🔍 PolySkill IR Inspector`));
      console.log(pc.gray(`   Source: ${pc.white(filename)}\n`));

      const ir = UniversalParser.parse(content, filename);
      const audit = GuardrailSynthesizer.audit(ir.tools, ir.guardrails);

      console.log(pc.bold('Universal Skill Metadata:'));
      console.log(`  Name:        ${pc.magenta(ir.name)}`);
      console.log(`  Display:     ${pc.white(ir.displayName)}`);
      console.log(`  Category:    ${pc.white(ir.category)}`);
      console.log(`  Source Type: ${pc.white(ir.metadata.sourceType)}`);
      console.log(`  Safety:      ${pc.green(`${audit.safetyScore}/100`)}\n`);

      console.log(pc.bold(`Discovered Tools (${ir.tools.length}):`));
      for (const tool of ir.tools) {
        const riskColor = tool.riskLevel === 'destructive_write' ? pc.red : (tool.riskLevel === 'idempotent_write' ? pc.yellow : pc.green);
        console.log(`  • ${pc.bold(tool.name)} ${riskColor(`[${tool.riskLevel}]`)}`);
        console.log(`    ${pc.gray(tool.description)}`);
        const params = Object.keys(tool.parameters.properties);
        if (params.length > 0) {
          console.log(`    Params: ${pc.cyan(params.join(', '))}`);
        }
      }
      console.log();
    } catch (err: unknown) {
      console.error(pc.red(`\n[INSPECT FAILED] ${err instanceof Error ? err.message : String(err)}\n`));
      process.exit(1);
    }
  });

// Command 3: test
program
  .command('test')
  .description('Simulate a tool execution in the PolySkill sandbox to verify guardrail enforcement')
  .argument('<source>', 'Path to source file or manifest')
  .requiredOption('--tool <name>', 'Name of the tool to simulate')
  .option('--args <json>', 'JSON string of input arguments', '{}')
  .action((sourcePath: string, options: { tool: string; args: string }) => {
    try {
      const resolvedPath = path.resolve(process.cwd(), sourcePath);
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const filename = path.basename(resolvedPath);

      const ir = UniversalParser.parse(content, filename);
      const hardened = GuardrailSynthesizer.synthesize(ir.tools, ir.guardrails);
      ir.tools = hardened;

      const parsedArgs = JSON.parse(options.args);

      console.log(pc.cyan(`\n🛡️  PolySkill Sandbox Simulator`));
      console.log(pc.gray(`   Tool: ${pc.white(options.tool)}`));
      console.log(pc.gray(`   Args: ${pc.white(JSON.stringify(parsedArgs))}\n`));

      const result = SandboxRunner.simulateExecution(ir, options.tool, parsedArgs);

      if (result.guardrailBlocked) {
        console.log(pc.red(pc.bold(`❌ EXECUTION BLOCKED BY GUARDRAIL:`)));
        console.log(pc.red(`   ${result.blockReason}\n`));
        process.exit(2);
      } else if (!result.success) {
        console.log(pc.yellow(pc.bold(`⚠️  EXECUTION FAILED:`)));
        console.log(pc.yellow(`   ${result.blockReason}\n`));
        process.exit(1);
      } else {
        console.log(pc.green(pc.bold(`✔ EXECUTION PERMITTED & SIMULATED (${result.durationMs}ms):`)));
        console.log(pc.gray(JSON.stringify(result.output, null, 2)) + '\n');
      }
    } catch (err: unknown) {
      console.error(pc.red(`\n[TEST ERROR] ${err instanceof Error ? err.message : String(err)}\n`));
      process.exit(1);
    }
  });

// Command 4: ui
program
  .command('ui')
  .description('Launch the local PolySkill Visual Web Studio')
  .option('-p, --port <port>', 'HTTP port to listen on', '3456')
  .action((options: { port: string }) => {
    const port = parseInt(options.port, 10) || 3456;
    startWebServer(port);
  });


// Command: create (Natural Language Skill Synthesizer)
program
  .command('create')
  .description('Synthesize a new agent skill from a plain-English prompt')
  .argument('<prompt>', 'Description of what the skill should do')
  .option('-t, --targets <targets>', 'Comma-separated target list (antigravity, mcp, cursor, openai, all)', 'all')
  .option('-o, --out <dir>', 'Output destination directory', './dist')
  .option('--provider <provider>', 'Synthesizer engine: builtin, gemini, openai, ollama', 'builtin')
  .option('--key <apiKey>', 'API key for BYOK provider')
  .action(async (prompt: string, options: { targets: string; out: string; provider: string; key?: string }) => {
    try {
      console.log(pc.cyan(`\n⚡ PolySkill Natural Language Synthesizer`));
      console.log(pc.gray(`   Prompt:   ${pc.white(prompt)}`));
      console.log(pc.gray(`   Engine:   ${pc.magenta(options.provider)}`));
      console.log(pc.gray(`   Output:   ${pc.white(options.out)}\n`));

      const startTime = performance.now();
      const targets = options.targets.split(',').map(t => t.trim()) as CompilerTarget[];

      // Step 1: Synthesize IR
      const { NaturalLanguageSynthesizer } = await import('../parsers/natural.js');
      const ir = await NaturalLanguageSynthesizer.synthesize({
        prompt,
        provider: options.provider as any,
        apiKey: options.key
      });

      // Step 2: Harden Guardrails
      ir.tools = GuardrailSynthesizer.synthesize(ir.tools, ir.guardrails);

      // Step 3: Run Audit
      const audit = GuardrailSynthesizer.audit(ir.tools, ir.guardrails);
      ir.metadata.safetyScore = audit.safetyScore;

      // Step 4: Emit Artifacts
      const { TargetEmissions } = await import('../generators/index.js');
      const targetFiles = TargetEmissions.emit(ir, targets);

      const outDir = path.resolve(process.cwd(), options.out);
      for (const [relPath, fileContent] of Object.entries(targetFiles)) {
        const fullPath = path.join(outDir, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, fileContent, 'utf-8');
        console.log(pc.green(`  ✔ Emitted: `) + pc.white(path.relative(process.cwd(), fullPath)));
      }

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      console.log(`\n${pc.bold('Synthesis Summary:')}`);
      console.log(`  • Skill Name:   ${pc.bold(pc.magenta(ir.displayName))} (${pc.gray(ir.name)})`);
      console.log(`  • Capabilities: ${pc.bold(pc.yellow(String(ir.tools.length)))} tools generated`);
      console.log(`  • Safety Score: ${pc.green(pc.bold(`${audit.safetyScore}/100`))}`);
      console.log(`  • Artifacts:    ${pc.bold(String(Object.keys(targetFiles).length))} files in ${elapsed}s\n`);
    } catch (err: unknown) {
      console.error(pc.red(`\n[SYNTHESIS FAILED] ${err instanceof Error ? err.message : String(err)}\n`));
      process.exit(1);
    }
  });


// Command: print-md (Print bare SKILL.md directly to stdout)
program
  .command('print-md')
  .description('Compile and output bare SKILL.md markdown directly to stdout')
  .argument('<source>', 'Path to source file or prompt')
  .action((sourcePath: string) => {
    try {
      const resolvedPath = path.resolve(process.cwd(), sourcePath);
      let content = '';
      let filename = 'source.spec';

      if (fs.existsSync(resolvedPath)) {
        content = fs.readFileSync(resolvedPath, 'utf-8');
        filename = path.basename(resolvedPath);
      } else {
        content = sourcePath;
        filename = 'prompt.txt';
      }

      const result = PolySkillCompiler.compile(content, { filename, targets: ['antigravity'] });
      const md = result.targetFiles[`skills/${result.ir.name}/SKILL.md`];
      if (md) {
        process.stdout.write(md);
      } else {
        console.error('SKILL.md was not generated.');
        process.exit(1);
      }
    } catch (err: unknown) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// Command: install (Direct 1-click mounting to Antigravity, MCP, and Cursor)
program
  .command('install')
  .description('Compile and directly mount a skill into local agent environments (Antigravity, Claude Desktop MCP, Cursor)')
  .argument('<source>', 'Path to source file or manifest')
  .option('-t, --targets <targets>', 'Comma-separated target list (antigravity, mcp, cursor, all)', 'all')
  .option('-s, --scope <scope>', 'Antigravity scope (global or workspace)', 'global')
  .option('--claude-config <path>', 'Custom path to claude_desktop_config.json')
  .option('--dry-run', 'Simulate mounting without writing files or modifying configs')
  .option('--no-harden', 'Disable automated guardrail synthesis')
  .action((sourcePath: string, options: { targets: string; scope: string; claudeConfig?: string; dryRun?: boolean; harden?: boolean }) => {
    try {
      const resolvedPath = path.resolve(process.cwd(), sourcePath);
      if (!fs.existsSync(resolvedPath)) {
        console.error(pc.red(`\n[ERROR] Source file not found: ${resolvedPath}`));
        process.exit(1);
      }

      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const filename = path.basename(resolvedPath);
      const targets = options.targets.split(',').map(t => t.trim()) as InstallTarget[];
      const isDry = options.dryRun === true;

      console.log(pc.cyan(`\n⚡ PolySkill Agent Skill Installer`));
      console.log(pc.gray(`   Source:  ${pc.white(filename)}`));
      console.log(pc.gray(`   Targets: ${pc.white(targets.join(', '))}`));
      console.log(pc.gray(`   Scope:   ${pc.magenta(options.scope)}`));
      if (isDry) {
        console.log(pc.yellow(`   Mode:    DRY RUN (Simulated, no files modified)`));
      }
      console.log();

      const startTime = performance.now();
      const compilation = PolySkillCompiler.compile(content, {
        filename,
        targets: ['all'],
        hardenGuardrails: options.harden !== false
      });

      const installResult = SkillInstaller.install(compilation, {
        targets,
        scope: options.scope as InstallScope,
        claudeConfigPath: options.claudeConfig,
        dryRun: isDry
      });

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

      for (const item of installResult.installedItems) {
        const badge = item.status === 'simulated'
          ? pc.yellow(`  [SIMULATED]`)
          : (item.status === 'updated' ? pc.cyan(`  ✔ [UPDATED]`) : pc.green(`  ✔ [MOUNTED]`));
        console.log(`${badge} ${pc.bold(item.target.toUpperCase())}: ${pc.white(item.path)}`);
        if (item.details) {
          console.log(pc.gray(`      ${item.details}`));
        }
      }

      if (installResult.warnings.length > 0) {
        console.log(pc.yellow('\nWarnings:'));
        for (const w of installResult.warnings) {
          console.log(pc.yellow(`  ⚠️  ${w}`));
        }
      }

      console.log(`\n${pc.bold('Installation Summary:')}`);
      console.log(`  • Skill Name:   ${pc.bold(pc.magenta(compilation.ir.displayName))} (${pc.gray(compilation.ir.name)})`);
      console.log(`  • Mounted:      ${pc.bold(String(installResult.installedItems.length))} targets in ${elapsed}s`);
      console.log(`  • Safety Score: ${compilation.auditReport.safetyScore >= 80 ? pc.green(pc.bold(`${compilation.auditReport.safetyScore}/100`)) : pc.yellow(pc.bold(`${compilation.auditReport.safetyScore}/100`))}\n`);
    } catch (err: unknown) {
      console.error(pc.red(`\n[INSTALLATION FAILED] ${err instanceof Error ? err.message : String(err)}\n`));
      process.exit(1);
    }
  });

// Command: benchmark (High-resolution latency & telemetry profiler)
program
  .command('benchmark')
  .description('Run high-resolution compiler telemetry and compare performance against LLM prompt roundtrips')
  .option('-i, --iterations <count>', 'Number of iterations per fixture', '5')
  .action((options: { iterations: string }) => {
    try {
      const iters = parseInt(options.iterations, 10) || 5;
      console.log(pc.cyan(`\n⚡ PolySkill High-Resolution Compiler Benchmark`));
      console.log(pc.gray(`   Iterations: ${pc.white(String(iters))} runs per fixture`));
      console.log(pc.gray(`   Profiling:  AST Lexing, IR Validation, Audit, Synthesis, Codegen\n`));

      const report = BenchmarkRunner.run(iters);

      console.log(pc.bold('Execution Telemetry Matrix:'));
      console.log(pc.gray('------------------------------------------------------------------------------------------------'));
      console.log(`${pc.bold('Fixture'.padEnd(24))} | ${pc.bold('Type'.padEnd(10))} | ${pc.bold('Tools'.padEnd(6))} | ${pc.bold('Files'.padEnd(6))} | ${pc.bold('Parse'.padEnd(8))} | ${pc.bold('Audit'.padEnd(8))} | ${pc.bold('Codegen'.padEnd(8))} | ${pc.bold('Total')}`);
      console.log(pc.gray('------------------------------------------------------------------------------------------------'));

      for (const item of report.results) {
        const fixName = item.fixture.padEnd(24);
        const typeStr = item.sourceType.padEnd(10);
        const toolsStr = String(item.toolsExtracted).padEnd(6);
        const filesStr = String(item.artifactsEmitted).padEnd(6);
        const parseStr = `${item.timing.parseMs}ms`.padEnd(8);
        const auditStr = `${item.timing.auditMs}ms`.padEnd(8);
        const codegenStr = `${item.timing.codegenMs}ms`.padEnd(8);
        const totalStr = pc.bold(pc.green(`${item.timing.totalMs}ms`));

        console.log(`${pc.white(fixName)} | ${pc.magenta(typeStr)} | ${pc.yellow(toolsStr)} | ${pc.cyan(filesStr)} | ${pc.gray(parseStr)} | ${pc.gray(auditStr)} | ${pc.gray(codegenStr)} | ${totalStr}`);
      }
      console.log(pc.gray('------------------------------------------------------------------------------------------------\n'));

      console.log(pc.bold('Performance & Economic Metrics:'));
      console.log(`  • Average Compilation Latency: ${pc.bold(pc.green(`${report.overallAverageMs} ms`))}`);
      console.log(`  • Compiler Throughput:         ${pc.bold(pc.cyan(`${report.compilationsPerSecond} compiles/sec`))}`);
      console.log(`  • Zero-Cost Cloud Advantage:   ${pc.bold(pc.green('$0 (100% offline, zero API tokens)'))}`);
      console.log(`  • LLM Comparison Speedup:     ${pc.bold(pc.yellow(`${report.llmComparisonSpeedup}x faster`))} than cloud LLM prompting (~3500ms)\n`);
    } catch (err: unknown) {
      console.error(pc.red(`\n[BENCHMARK ERROR] ${err instanceof Error ? err.message : String(err)}\n`));
      process.exit(1);
    }
  });

program.parse(process.argv);
