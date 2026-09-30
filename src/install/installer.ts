import * as fs from 'node:fs';
import * as path from 'node:path';
import { CompilationResult } from '../ir/types.js';
import { ConfigDetector } from './detector.js';
import { InstalledItem, InstallOptions, InstallResult, InstallTarget } from './types.js';

export class SkillInstaller {
  /**
   * Installs compiled skills directly into active runtime environments
   * (Google Antigravity, Claude Desktop MCP, Cursor / Windsurf rules).
   */
  static install(result: CompilationResult, options: InstallOptions = {}): InstallResult {
    const ir = result.ir;
    const requestedTargets: InstallTarget[] = options.targets && options.targets.length > 0
      ? options.targets
      : ['all'];
    const isAll = requestedTargets.includes('all');
    const dryRun = options.dryRun === true;
    const workspaceDir = options.workspaceDir || process.cwd();

    const installedItems: InstalledItem[] = [];
    const warnings: string[] = [];

    // 1. Install Google Antigravity Skill
    if (isAll || requestedTargets.includes('antigravity')) {
      try {
        const agSkillsBase = options.antigravityDir || ConfigDetector.getAntigravitySkillsDir(options.scope || 'global', workspaceDir);
        const skillTargetDir = path.join(agSkillsBase, ir.name);

        const skillMd = result.targetFiles[`skills/${ir.name}/SKILL.md`];
        const runnerScript = result.targetFiles[`skills/${ir.name}/scripts/runner.mjs`];
        const specMd = result.targetFiles[`skills/${ir.name}/references/SPEC.md`];

        if (!dryRun) {
          fs.mkdirSync(path.join(skillTargetDir, 'scripts'), { recursive: true });
          fs.mkdirSync(path.join(skillTargetDir, 'references'), { recursive: true });

          if (skillMd) fs.writeFileSync(path.join(skillTargetDir, 'SKILL.md'), skillMd, 'utf-8');
          if (runnerScript) {
            const runnerPath = path.join(skillTargetDir, 'scripts', 'runner.mjs');
            fs.writeFileSync(runnerPath, runnerScript, 'utf-8');
            try {
              fs.chmodSync(runnerPath, 0o755);
            } catch {
              // chmod may fail on Windows without impacting execution
            }
          }
          if (specMd) fs.writeFileSync(path.join(skillTargetDir, 'references', 'SPEC.md'), specMd, 'utf-8');
        }

        installedItems.push({
          target: 'antigravity',
          path: skillTargetDir,
          status: dryRun ? 'simulated' : 'installed',
          details: `Mounted to ${options.scope || 'global'} Antigravity directory with SKILL.md, runner, and SPEC`
        });
      } catch (err) {
        warnings.push(`Failed to install Antigravity skill: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 2. Install Model Context Protocol (MCP) server & configure Claude Desktop
    if (isAll || requestedTargets.includes('mcp')) {
      try {
        const mcpBase = options.mcpServerDir || ConfigDetector.getDefaultMcpServerDir();
        const serverDir = path.join(mcpBase, ir.name);
        const serverFilePath = path.join(serverDir, 'mcp-server.mjs');
        const mcpServerCode = result.targetFiles[`mcp/${ir.name}/mcp-server.mjs`];

        if (mcpServerCode) {
          if (!dryRun) {
            fs.mkdirSync(serverDir, { recursive: true });
            fs.writeFileSync(serverFilePath, mcpServerCode, 'utf-8');
            try {
              fs.chmodSync(serverFilePath, 0o755);
            } catch {
              // Windows-friendly chmod
            }
          }

          // Register in Claude Desktop configuration
          const claudeConfigPath = ConfigDetector.getClaudeConfigPath(options.claudeConfigPath);
          let claudeConfig: { mcpServers?: Record<string, { command: string; args: string[] }> } = { mcpServers: {} };

          if (fs.existsSync(claudeConfigPath)) {
            try {
              const raw = fs.readFileSync(claudeConfigPath, 'utf-8');
              claudeConfig = JSON.parse(raw);
              claudeConfig.mcpServers = claudeConfig.mcpServers || {};
            } catch (parseErr) {
              warnings.push(`Existing Claude Desktop config at ${claudeConfigPath} had invalid JSON. Creating backup.`);
            }
          }

          claudeConfig.mcpServers = claudeConfig.mcpServers || {};
          const isUpdated = Boolean(claudeConfig.mcpServers[ir.name]);
          claudeConfig.mcpServers[ir.name] = {
            command: 'node',
            args: [serverFilePath]
          };

          if (!dryRun) {
            fs.mkdirSync(path.dirname(claudeConfigPath), { recursive: true });
            fs.writeFileSync(claudeConfigPath, JSON.stringify(claudeConfig, null, 2), 'utf-8');
          }

          installedItems.push({
            target: 'mcp',
            path: serverFilePath,
            status: dryRun ? 'simulated' : (isUpdated ? 'updated' : 'installed'),
            details: `Registered MCP server in Claude Desktop config: ${claudeConfigPath}`
          });
        }
      } catch (err) {
        warnings.push(`Failed to install MCP server: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 3. Install Cursor & Windsurf Rules
    if (isAll || requestedTargets.includes('cursor')) {
      try {
        const cursorRule = result.targetFiles[`cursor/${ir.name}/.cursorrules`];
        const windsurfRule = result.targetFiles[`cursor/${ir.name}/.windsurfrules`];

        if (cursorRule) {
          const cursorPath = ConfigDetector.getCursorRulesPath(workspaceDir);
          this.mergeRuleFile(cursorPath, ir.name, cursorRule, dryRun);
          installedItems.push({
            target: 'cursor',
            path: cursorPath,
            status: dryRun ? 'simulated' : 'installed',
            details: `Configured .cursorrules in workspace: ${workspaceDir}`
          });
        }

        if (windsurfRule) {
          const windsurfPath = ConfigDetector.getWindsurfRulesPath(workspaceDir);
          this.mergeRuleFile(windsurfPath, ir.name, windsurfRule, dryRun);
          installedItems.push({
            target: 'windsurf',
            path: windsurfPath,
            status: dryRun ? 'simulated' : 'installed',
            details: `Configured .windsurfrules in workspace: ${workspaceDir}`
          });
        }
      } catch (err) {
        warnings.push(`Failed to install IDE rules: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      skillName: ir.name,
      installedItems,
      warnings
    };
  }

  /**
   * Safely merges or updates a rule block in .cursorrules or .windsurfrules
   */
  private static mergeRuleFile(filePath: string, skillName: string, content: string, dryRun: boolean): void {
    const startTag = `# --- PolySkill: ${skillName} (START) ---`;
    const endTag = `# --- PolySkill: ${skillName} (END) ---`;
    const taggedBlock = `${startTag}\n${content.trim()}\n${endTag}\n`;

    let finalContent = taggedBlock;

    if (fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, 'utf-8');
      if (existing.includes(startTag) && existing.includes(endTag)) {
        // Replace existing block
        const regex = new RegExp(`${escapeRegex(startTag)}[\\s\\S]*?${escapeRegex(endTag)}\\n?`, 'g');
        finalContent = existing.replace(regex, taggedBlock);
      } else {
        // Append block with separator
        finalContent = existing.trim() + '\n\n' + taggedBlock;
      }
    }

    if (!dryRun) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, finalContent, 'utf-8');
    }
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
