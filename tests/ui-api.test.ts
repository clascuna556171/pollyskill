import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { NaturalLanguageSynthesizer } from '../src/parsers/natural.js';
import { buildZipArchive } from '../src/ui/zip.js';
import { startWebServer } from '../src/ui/server.js';

describe('Studio API, Synthesis & ZIP Bundle Suite', () => {
  test('NaturalLanguageSynthesizer derives meaningful topic names and destructive gates for custom prompts', async () => {
    const ir = await NaturalLanguageSynthesizer.synthesize({
      prompt: 'Clean up and purge stale docker containers safely'
    });
    assert.ok(!ir.name.includes('custom-domain-assistant'));
    assert.ok(ir.tools.some(t => t.riskLevel === 'destructive_write'));
  });

  test('NaturalLanguageSynthesizer rejects BYOK provider without API key', async () => {
    await assert.rejects(
      () => NaturalLanguageSynthesizer.synthesize({ prompt: 'Audit APIs', provider: 'gemini' }),
      /API key is required/
    );
  });

  test('buildZipArchive emits a valid PKZIP archive with local and central headers', () => {
    const zip = buildZipArchive({
      'skills/demo/SKILL.md': '# Demo Skill\n',
      'mcp/demo/mcp-server.mjs': 'console.log("ok");\n'
    });

    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    assert.ok(zip.includes(Buffer.from('skills/demo/SKILL.md', 'utf-8')));
    assert.ok(zip.includes(Buffer.from('mcp/demo/mcp-server.mjs', 'utf-8')));
    // End of central directory signature at tail (comment length = 0 -> last 22 bytes)
    assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
    assert.equal(zip.readUInt16LE(zip.length - 12), 2);
  });

  test('Web Studio API supports synthesize, recompile, dry-run install, and real zip bundle', async () => {
    const server = startWebServer(0);
    await new Promise<void>(resolve => {
      if (server.listening) resolve();
      else server.once('listening', () => resolve());
    });

    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      // 0. Static studio HTML serves the guided 3-step UX
      const htmlRes = await fetch(`${baseUrl}/`);
      assert.equal(htmlRes.status, 200);
      const htmlText = await htmlRes.text();
      assert.ok(htmlText.includes('Create or Pick Source'));
      assert.ok(htmlText.includes('From Code / API Spec'));
      assert.ok(htmlText.includes('Install to Local Agents'));

      // 1. Synthesize with custom display name
      const synthRes = await fetch(`${baseUrl}/api/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Analyze release changelogs and validate semantic versions',
          name: 'Release Changelog Doctor'
        })
      });
      assert.equal(synthRes.status, 200);
      const synthData = await synthRes.json();
      assert.equal(synthData.ir.displayName, 'Release Changelog Doctor');
      assert.equal(synthData.ir.name, 'release-changelog-doctor');

      // 2. Recompile after marking a tool destructive_write in UI editor
      synthData.ir.tools[0].riskLevel = 'destructive_write';
      const recompileRes = await fetch(`${baseUrl}/api/recompile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir: synthData.ir })
      });
      assert.equal(recompileRes.status, 200);
      const recompiled = await recompileRes.json();
      assert.ok(recompiled.ir.tools[0].parameters.properties.confirm, 'Recompile must auto-inject confirm gate');
      assert.ok(recompiled.ir.tools[0].parameters.properties.dryRun, 'Recompile must auto-inject dryRun flag');

      // 3. Dry-run install preview
      const installRes = await fetch(`${baseUrl}/api/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ir: recompiled.ir,
          targets: ['antigravity', 'mcp'],
          dryRun: true
        })
      });
      assert.equal(installRes.status, 200);
      const installData = await installRes.json();
      assert.equal(installData.skillName, 'release-changelog-doctor');
      assert.ok(installData.installedItems.every((i: { status: string }) => i.status === 'simulated'));

      // 4. Genuine ZIP download
      const zipRes = await fetch(`${baseUrl}/api/bundle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: recompiled.ir.name,
          targetFiles: recompiled.targetFiles
        })
      });
      assert.equal(zipRes.status, 200);
      assert.equal(zipRes.headers.get('content-type'), 'application/zip');
      const zipBytes = Buffer.from(await zipRes.arrayBuffer());
      assert.equal(zipBytes.readUInt32LE(0), 0x04034b50);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
