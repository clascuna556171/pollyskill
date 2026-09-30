#!/usr/bin/env node
/**
 * Cross-platform test runner for PolySkill test suite.
 * Compatible with Node.js 18.x, 20.x, and 22.x across Linux, macOS, and Windows.
 * 
 * Bypasses shell glob limitations: Node <= 20 and Windows cmd.exe do not expand
 * 'tests/**\/*.test.ts' glob patterns natively, which caused CI failures on Node 18 & 20.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const cliArgs = process.argv.slice(2);
let testFiles = [];

if (cliArgs.length > 0) {
  testFiles = cliArgs;
} else {
  const testsDir = path.resolve(process.cwd(), 'tests');
  testFiles = fs.readdirSync(testsDir)
    .filter(file => file.endsWith('.test.ts'))
    .sort()
    .map(file => path.join('tests', file));
}

if (testFiles.length === 0) {
  console.error('No test files found in tests/');
  process.exit(1);
}

const tsxCli = path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');

const result = spawnSync(process.execPath, [tsxCli, '--test', ...testFiles], {
  stdio: 'inherit',
  env: process.env
});

process.exit(result.status ?? (result.error ? 1 : 0));
