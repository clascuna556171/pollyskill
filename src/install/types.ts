export type InstallTarget = 'antigravity' | 'mcp' | 'cursor' | 'all';
export type InstallScope = 'global' | 'workspace';

export interface InstalledItem {
  target: string;
  path: string;
  status: 'installed' | 'updated' | 'skipped' | 'simulated';
  details?: string;
}

export interface InstallOptions {
  targets?: InstallTarget[];
  scope?: InstallScope;
  workspaceDir?: string;
  antigravityDir?: string;
  claudeConfigPath?: string;
  mcpServerDir?: string;
  dryRun?: boolean;
}

export interface InstallResult {
  skillName: string;
  installedItems: InstalledItem[];
  warnings: string[];
}
