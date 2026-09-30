import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PolySkillCompiler } from '../src/compiler.js';
import { SkillInstaller } from '../src/install/installer.js';
import { ConfigDetector } from '../src/install/detector.js';

describe('SkillInstaller & ConfigDetector Test Suite', () => {
  const samplePython = `
def restart_nginx(service: str = "nginx") -> None:
    """Restarts the specified system service."""
    pass
`;

  test('ConfigDetector resolves system paths across platforms', () => {
    const globalAg = ConfigDetector.getAntigravitySkillsDir('global');
    assert.ok(globalAg.includes('.gemini'), 'global Antigravity dir should contain .gemini');

    const workspaceAg = ConfigDetector.getAntigravitySkillsDir('workspace', '/tmp/my-proj');
    assert.ok(workspaceAg.includes('.agents'), 'workspace Antigravity dir should contain .agents');

    const claudePath = ConfigDetector.getClaudeConfigPath();
    assert.ok(claudePath.includes('Claude'), 'Claude config path should contain Claude');
  });

  test('SkillInstaller simulates installation in dryRun mode without modifying disk', () => {
    const compilation = PolySkillCompiler.compile(samplePython, { filename: 'test-ops.py' });
    const result = SkillInstaller.install(compilation, {
      targets: ['all'],
      dryRun: true
    });

    assert.strictEqual(result.skillName, 'test-ops');
    assert.ok(result.installedItems.length >= 3, 'Should have items for Antigravity, MCP, and Cursor');
    for (const item of result.installedItems) {
      assert.strictEqual(item.status, 'simulated');
    }
  });

  test('SkillInstaller successfully mounts Antigravity skill files to directory', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyskill-install-test-'));
    try {
      const compilation = PolySkillCompiler.compile(samplePython, { filename: 'service-ops.py' });
      const result = SkillInstaller.install(compilation, {
        targets: ['antigravity'],
        antigravityDir: tempDir
      });

      assert.strictEqual(result.installedItems[0].status, 'installed');
      const installedDir = path.join(tempDir, 'service-ops');
      assert.ok(fs.existsSync(path.join(installedDir, 'SKILL.md')));
      assert.ok(fs.existsSync(path.join(installedDir, 'scripts', 'runner.mjs')));
      assert.ok(fs.existsSync(path.join(installedDir, 'references', 'SPEC.md')));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('SkillInstaller mounts MCP server and updates Claude Desktop config', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyskill-mcp-test-'));
    try {
      const mockClaudeConfig = path.join(tempDir, 'claude_config.json');
      fs.writeFileSync(mockClaudeConfig, JSON.stringify({ mcpServers: { existing: { command: 'node', args: ['existing.js'] } } }), 'utf-8');

      const compilation = PolySkillCompiler.compile(samplePython, { filename: 'mcp-ops.py' });
      const result = SkillInstaller.install(compilation, {
        targets: ['mcp'],
        mcpServerDir: path.join(tempDir, 'mcp-servers'),
        claudeConfigPath: mockClaudeConfig
      });

      assert.strictEqual(result.installedItems[0].status, 'installed');
      const updatedConfig = JSON.parse(fs.readFileSync(mockClaudeConfig, 'utf-8'));
      assert.ok(updatedConfig.mcpServers['existing'], 'Preserves existing MCP server configuration');
      assert.ok(updatedConfig.mcpServers['mcp-ops'], 'Registers new mcp-ops server');
      assert.strictEqual(updatedConfig.mcpServers['mcp-ops'].command, 'node');
      assert.ok(fs.existsSync(updatedConfig.mcpServers['mcp-ops'].args[0]), 'Emitted mcp-server.mjs file exists on disk');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('SkillInstaller updates and merges workspace .cursorrules cleanly', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyskill-cursor-test-'));
    try {
      const compilation = PolySkillCompiler.compile(samplePython, { filename: 'cursor-ops.py' });
      
      // Install first time
      SkillInstaller.install(compilation, {
        targets: ['cursor'],
        workspaceDir: tempDir
      });

      const cursorPath = path.join(tempDir, '.cursorrules');
      assert.ok(fs.existsSync(cursorPath));
      const contentFirst = fs.readFileSync(cursorPath, 'utf-8');
      assert.ok(contentFirst.includes('# --- PolySkill: cursor-ops (START) ---'));

      // Install second time (update)
      SkillInstaller.install(compilation, {
        targets: ['cursor'],
        workspaceDir: tempDir
      });

      const contentSecond = fs.readFileSync(cursorPath, 'utf-8');
      const startCount = (contentSecond.match(/# --- PolySkill: cursor-ops \(START\) ---/g) || []).length;
      assert.strictEqual(startCount, 1, 'Should replace existing block rather than duplicating');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
