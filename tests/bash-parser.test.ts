import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BashParser } from '../src/parsers/bash.js';
import { UniversalParser } from '../src/parsers/index.js';
import { PolySkillCompiler } from '../src/compiler.js';

describe('Bash / Shell Script Parser Test Suite', () => {
  const getoptsSample = `#!/usr/bin/env bash
# Description: Backup Postgres database to S3 bucket
# Usage: ./backup.sh -d dbname -b s3_bucket -v

DATABASE=""
BUCKET=""
VERBOSE=false

while getopts "d:b:v" opt; do
  case $opt in
    d) DATABASE="$OPTARG" ;;
    b) BUCKET="$OPTARG" ;;
    v) VERBOSE=true ;;
    *) exit 1 ;;
  esac
done

pg_dump -Fc "$DATABASE" | aws s3 cp - "s3://$BUCKET/backup.dump"
`;

  test('BashParser extracts parameters and metadata from getopts script', () => {
    const ir = BashParser.parse(getoptsSample, 'db-backup.sh');

    assert.strictEqual(ir.name, 'db-backup');
    assert.strictEqual(ir.displayName, 'Db Backup Shell Tool');
    assert.strictEqual(ir.description, 'Backup Postgres database to S3 bucket');
    assert.strictEqual(ir.tools.length, 1);

    const tool = ir.tools[0];
    assert.strictEqual(tool.name, 'db-backup_run');
    assert.ok(tool.parameters.properties['opt_d'], 'Extracts -d flag');
    assert.strictEqual(tool.parameters.properties['opt_d'].type, 'string');
    assert.ok(tool.parameters.properties['opt_b'], 'Extracts -b flag');
    assert.strictEqual(tool.parameters.properties['opt_b'].type, 'string');
    assert.ok(tool.parameters.properties['opt_v'], 'Extracts -v flag');
    assert.strictEqual(tool.parameters.properties['opt_v'].type, 'boolean');
  });

  test('BashParser correctly parses real-world docker-cleanup.sh fixture', () => {
    const fixturePath = path.resolve(process.cwd(), 'examples/docker-cleanup.sh');
    const content = fs.readFileSync(fixturePath, 'utf-8');

    const ir = BashParser.parse(content, 'docker-cleanup.sh');

    assert.strictEqual(ir.name, 'docker-cleanup');
    assert.ok(ir.description.includes('Docker containers'));
    assert.strictEqual(ir.tools.length, 1);

    const tool = ir.tools[0];
    assert.strictEqual(tool.riskLevel, 'destructive_write');
    assert.ok(tool.parameters.properties['prune_all']);
    assert.strictEqual(tool.parameters.properties['prune_all'].type, 'boolean');
    assert.ok(tool.parameters.properties['older_than_days']);
    assert.strictEqual(tool.parameters.properties['older_than_days'].type, 'integer');
  });

  test('UniversalParser auto-routes shell scripts with shebangs to BashParser', () => {
    const ir = UniversalParser.parse(getoptsSample, 'backup');
    assert.strictEqual(ir.category, 'devops');
    assert.strictEqual(ir.metadata.sourceType, 'shell');
    assert.strictEqual(ir.tools[0].execution.language, 'bash');
  });

  test('PolySkillCompiler compiles bash script into Antigravity, MCP, and Cursor artifacts', () => {
    const fixturePath = path.resolve(process.cwd(), 'examples/docker-cleanup.sh');
    const content = fs.readFileSync(fixturePath, 'utf-8');

    const result = PolySkillCompiler.compile(content, {
      filename: 'docker-cleanup.sh',
      targets: ['all']
    });

    assert.strictEqual(result.ir.name, 'docker-cleanup');
    assert.ok(result.targetFiles['skills/docker-cleanup/SKILL.md']);
    assert.ok(result.targetFiles['skills/docker-cleanup/scripts/runner.mjs']);
    assert.ok(result.targetFiles['mcp/docker-cleanup/mcp-server.mjs']);
    assert.ok(result.targetFiles['mcp/docker-cleanup/mcp-sse-server.mjs']);
    assert.ok(result.targetFiles['cursor/docker-cleanup/.cursorrules']);
    assert.ok(result.auditReport.safetyScore >= 80);
  });
});
