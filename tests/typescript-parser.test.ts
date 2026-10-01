import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TypeScriptParser } from '../src/parsers/typescript.js';
import { UniversalParser } from '../src/parsers/index.js';
import { PolySkillCompiler } from '../src/compiler.js';

describe('TypeScript / JSDoc AST Parser Test Suite', () => {
  const tsSample = `/**
 * @fileoverview Kubernetes Cluster Autoscaler Operations
 * Automated tools to monitor nodes and scale cluster node groups.
 */

export interface AutoscalerConfig {
  /** Target cluster ID */
  clusterName: string;
  /** Cloud region */
  region: 'us-east-1' | 'eu-west-1' | 'ap-southeast-1';
  /** Minimum node count */
  minNodes?: number;
  /** Maximum node count */
  maxNodes: number;
}

/**
 * Update autoscaling group limits for a cluster.
 * @param config Target autoscaler configuration
 */
export async function updateAutoscalingLimits(config: AutoscalerConfig): Promise<boolean> {
  return true;
}

/**
 * Fetch current node allocation and pod capacity.
 * @param clusterName Cluster identifier
 */
export const getNodeMetrics = async (clusterName: string): Promise<Record<string, number>> => {
  return { cpu: 80, memory: 65 };
};

/**
 * Terminate all worker nodes in an autoscaling group.
 * @param clusterName Cluster identifier
 * @param force Whether to force terminate pods
 */
export async function terminateNodeGroup(clusterName: string, force: boolean = false): Promise<void> {
  // termination logic
}
`;

  test('TypeScriptParser extracts exported functions, interfaces, and union enums', () => {
    const ir = TypeScriptParser.parse(tsSample, 'k8s-autoscaler.ts');

    assert.strictEqual(ir.name, 'k8s-autoscaler');
    assert.ok(ir.description.includes('Autoscaler Operations'));
    assert.strictEqual(ir.tools.length, 3);

    // 1. Check updateAutoscalingLimits (idempotent write, interface resolution)
    const updateTool = ir.tools.find(t => t.name === 'updateAutoscalingLimits');
    assert.ok(updateTool, 'Tool updateAutoscalingLimits exists');
    assert.strictEqual(updateTool.riskLevel, 'idempotent_write');
    assert.ok(updateTool.parameters.properties['clusterName'], 'Contains clusterName from interface');
    assert.ok(updateTool.parameters.properties['region'], 'Contains region from interface');
    assert.deepStrictEqual(updateTool.parameters.properties['region'].enum, ['us-east-1', 'eu-west-1', 'ap-southeast-1']);
    assert.strictEqual(updateTool.parameters.properties['maxNodes'].type, 'number');

    // 2. Check getNodeMetrics (arrow function, read_only)
    const metricsTool = ir.tools.find(t => t.name === 'getNodeMetrics');
    assert.ok(metricsTool, 'Tool getNodeMetrics exists');
    assert.strictEqual(metricsTool.riskLevel, 'read_only');
    assert.ok(metricsTool.parameters.properties['clusterName']);

    // 3. Check terminateNodeGroup (destructive write, default param)
    const termTool = ir.tools.find(t => t.name === 'terminateNodeGroup');
    assert.ok(termTool, 'Tool terminateNodeGroup exists');
    assert.strictEqual(termTool.riskLevel, 'destructive_write');
    assert.strictEqual(termTool.parameters.properties['force'].type, 'boolean');
    assert.strictEqual(termTool.parameters.properties['force'].default, false);
  });

  test('TypeScriptParser parses real-world cloud-deploy.ts fixture', () => {
    const fixturePath = path.resolve(process.cwd(), 'examples/cloud-deploy.ts');
    const content = fs.readFileSync(fixturePath, 'utf-8');

    const ir = TypeScriptParser.parse(content, 'cloud-deploy.ts');

    assert.strictEqual(ir.name, 'cloud-deploy');
    assert.strictEqual(ir.tools.length, 3);

    const deployTool = ir.tools.find(t => t.name === 'deployMicroservice');
    assert.ok(deployTool);
    assert.deepStrictEqual(deployTool.parameters.properties['environment'].enum, ['development', 'staging', 'production']);

    const terminateTool = ir.tools.find(t => t.name === 'terminateCluster');
    assert.ok(terminateTool);
    assert.strictEqual(terminateTool.riskLevel, 'destructive_write');
  });

  test('UniversalParser auto-routes TypeScript files to TypeScriptParser', () => {
    const fixturePath = path.resolve(process.cwd(), 'examples/cloud-deploy.ts');
    const content = fs.readFileSync(fixturePath, 'utf-8');

    const ir = UniversalParser.parse(content, 'cloud-deploy.ts');
    assert.strictEqual(ir.metadata.sourceType, 'typescript');
    assert.strictEqual(ir.tools.length, 3);
  });

  test('PolySkillCompiler compiles TypeScript into Antigravity, MCP, and Cursor artifacts', () => {
    const fixturePath = path.resolve(process.cwd(), 'examples/cloud-deploy.ts');
    const content = fs.readFileSync(fixturePath, 'utf-8');

    const result = PolySkillCompiler.compile(content, {
      filename: 'cloud-deploy.ts',
      targets: ['all'],
      hardenGuardrails: true
    });

    assert.ok(result.ir);
    const emitted = Object.keys(result.targetFiles);
    assert.ok(emitted.length >= 6);

    // Verify Antigravity SKILL.md
    assert.ok(emitted.includes('skills/cloud-deploy/SKILL.md'));
    assert.ok(result.targetFiles['skills/cloud-deploy/SKILL.md'].includes('deployMicroservice'));

    // Verify MCP Server
    assert.ok(emitted.includes('mcp/cloud-deploy/mcp-server.mjs'));
    assert.ok(result.targetFiles['mcp/cloud-deploy/mcp-server.mjs'].includes('terminateCluster'));

    // Verify Cursor rules
    assert.ok(emitted.includes('cursor/cloud-deploy/.cursorrules'));
  });
});
