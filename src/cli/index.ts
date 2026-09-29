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

program.parse(process.argv);
