import * as os from 'node:os';
import * as path from 'node:path';
import * as process from 'node:process';
import { InstallScope } from './types.js';

export class ConfigDetector {
  /**
   * Resolves the Antigravity Skills directory.
   * - Global: ~/.gemini/config/skills
   * - Workspace: <workspaceDir>/.agents/skills
   */
  static getAntigravitySkillsDir(scope: InstallScope = 'global', workspaceDir = process.cwd()): string {
    if (scope === 'workspace') {
      return path.resolve(workspaceDir, '.agents', 'skills');
    }
    return path.resolve(os.homedir(), '.gemini', 'config', 'skills');
  }

  /**
   * Resolves the Claude Desktop configuration JSON file path based on OS:
   * - Windows: %APPDATA%\Claude\claude_desktop_config.json
   * - macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
   * - Linux: ~/.config/Claude/claude_desktop_config.json
   */
  static getClaudeConfigPath(customPath?: string): string {
    if (customPath) {
      return path.resolve(customPath);
    }

    const platform = os.platform();
    if (platform === 'win32') {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      return path.join(appData, 'Claude', 'claude_desktop_config.json');
    } else if (platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    } else {
      return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
    }
  }

  /**
   * Resolves default directory where persistent standalone MCP servers are mounted:
   * ~/.polyskill/mcp-servers/
   */
  static getDefaultMcpServerDir(): string {
    return path.resolve(os.homedir(), '.polyskill', 'mcp-servers');
  }

  /**
   * Resolves workspace .cursorrules file path
   */
  static getCursorRulesPath(workspaceDir = process.cwd()): string {
    return path.resolve(workspaceDir, '.cursorrules');
  }

  /**
   * Resolves workspace .windsurfrules file path
   */
  static getWindsurfRulesPath(workspaceDir = process.cwd()): string {
    return path.resolve(workspaceDir, '.windsurfrules');
  }
}
