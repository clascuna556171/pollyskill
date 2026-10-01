import { NaturalLanguageSynthesizer } from '../parsers/natural.js';
import { GuardrailSynthesizer } from '../guardrails/synthesizer.js';
import { TargetEmissions } from '../generators/index.js';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import { PolySkillCompiler } from '../compiler.js';
import { SandboxRunner } from '../sandbox/runner.js';
import { SkillIR } from '../ir/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, 'public');

export const PRESETS: Record<string, { filename: string; source: string; description: string }> = {
  'stripe-billing': {
    filename: 'stripe-billing.json',
    description: 'OpenAPI v3: Stripe Billing, Invoicing & Subscription API',
    source: JSON.stringify({
      openapi: '3.0.0',
      info: {
        title: 'Stripe Billing Ops',
        version: '2026-03-01',
        description: 'Operations skill for managing customer subscriptions, invoices, and payment refunds.'
      },
      servers: [{ url: 'https://api.stripe.com/v1' }],
      paths: {
        '/customers/{customerId}/subscriptions': {
          get: {
            operationId: 'list_customer_subscriptions',
            summary: 'List active subscriptions for a customer',
            parameters: [
              { name: 'customerId', in: 'path', required: true, description: 'Stripe customer ID (cus_xxx)', schema: { type: 'string' } },
              { name: 'status', in: 'query', required: false, description: 'Subscription status filter (active, past_due, canceled)', schema: { type: 'string' } }
            ]
          }
        },
        '/invoices/{invoiceId}/finalize': {
          post: {
            operationId: 'finalize_invoice',
            summary: 'Finalize an existing draft invoice',
            parameters: [
              { name: 'invoiceId', in: 'path', required: true, description: 'Invoice ID (in_xxx)', schema: { type: 'string' } }
            ],
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      auto_advance: { type: 'boolean', description: 'Automatically charge payment source' }
                    }
                  }
                }
              }
            }
          }
        },
        '/refunds': {
          post: {
            operationId: 'create_refund',
            summary: 'Issue a partial or full payment refund',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['chargeId', 'amount_cents'],
                    properties: {
                      chargeId: { type: 'string', description: 'Stripe charge identifier (ch_xxx)' },
                      amount_cents: { type: 'integer', description: 'Amount to refund in cents' },
                      reason: { type: 'string', description: 'Customer reason (duplicate, fraudulent, requested_by_customer)' }
                    }
                  }
                }
              }
            }
          }
        },
        '/customers/{customerId}': {
          delete: {
            operationId: 'delete_customer',
            summary: 'Permanently delete a customer record and detach cards',
            parameters: [
              { name: 'customerId', in: 'path', required: true, description: 'Stripe customer ID to purge', schema: { type: 'string' } }
            ]
          }
        }
      }
    }, null, 2)
  },
  'postgres-ops': {
    filename: 'db_migration_ops.py',
    description: 'Python CLI: Database backup, migration runner, and emergency vacuum',
    source: `"""
Database Migration & Maintenance Automation CLI
Provides tools for production PostgreSQL maintenance and schema updates.
"""
import argparse

def backup_database(database_name: str, output_path: str = "./backups") -> str:
    """
    Create a compressed pg_dump backup of the target database.
    :param database_name: Target Postgres database name
    :param output_path: Directory where backup .sql.gz should be stored
    """
    print(f"Creating backup of {database_name} in {output_path}...")
    return f"{output_path}/{database_name}.dump"

def run_pending_migrations(database_name: str, target_version: str = "latest", dry_run: bool = True) -> bool:
    """
    Apply pending Alembic/Flyway schema migrations to database.
    :param database_name: Target Postgres database name
    :param target_version: Target migration revision or latest
    :param dry_run: When True, outputs migration plan SQL without modifying tables
    """
    print(f"Applying migrations to {database_name} up to {target_version} (dry_run={dry_run})")
    return True

def vacuum_analyze_table(table_name: str, full: bool = False) -> str:
    """
    Run VACUUM ANALYZE to reclaim storage and update query planner statistics.
    :param table_name: Target relational table name
    :param full: Whether to execute VACUUM FULL (locks table)
    """
    return f"VACUUM {'FULL ' if full else ''}ANALYZE {table_name}"

def drop_orphaned_partition(table_name: str, partition_name: str) -> bool:
    """
    Purge expired time-series table partition permanently.
    :param table_name: Parent partitioned table
    :param partition_name: Target partition to drop
    """
    print(f"DROPPING PARTITION {partition_name} FROM {table_name}")
    return True
`
  },
  'cloud-sre': {
    filename: 'cloud-sre-runbook.yaml',
    description: 'Declarative SkillSpec: AWS ECS Service Recovery & Rollback Runbook',
    source: `name: ecs-service-sre
displayName: AWS ECS Incident Recovery
version: 1.2.0
description: Incident response automation skill to restart unhealthy ECS tasks, scale task counts, or rollback faulty deployments.
category: cloud

workflowInstructions: |
  1. Check task health status with check_cluster_health.
  2. For high CPU/memory pressure, scale task count with scale_service.
  3. If newly deployed task crashes, invoke rollback_deployment.
  4. Always simulate changes with dryRun before modifying production capacity.

triggerPhrases:
  - "check ECS task health"
  - "rollback failing deployment"
  - "scale ECS service"

tools:
  - name: check_cluster_health
    description: Query ECS cluster CPU, memory, and container restart metrics.
    riskLevel: read_only
    parameters:
      cluster_name:
        type: string
        description: Target ECS cluster name
        required: true
      service_name:
        type: string
        description: ECS service name
        required: true

  - name: scale_service
    description: Scale desired container task count for an ECS service.
    riskLevel: idempotent_write
    parameters:
      cluster_name:
        type: string
        required: true
      service_name:
        type: string
        required: true
      desired_count:
        type: integer
        required: true
        description: Desired number of running task replicas

  - name: rollback_deployment
    description: Force rollback service to previous stable task definition revision.
    riskLevel: destructive_write
    parameters:
      cluster_name:
        type: string
        required: true
      service_name:
        type: string
        required: true
      target_revision:
        type: string
        required: false
        description: Specific revision number to pin
`
  },
  'cloud-deploy': {
    filename: 'cloud-deploy.ts',
    description: 'TypeScript: AWS Cloud & Container Deployment Operations SDK',
    source: `/**
 * @fileoverview AWS Cloud & Container Deployment Operations SDK
 * Provides automated tools to deploy microservices, monitor container metrics, and terminate clusters.
 */

export interface DeployConfig {
  /** Target Kubernetes or ECS cluster identifier */
  clusterId: string;
  /** Deployment target environment */
  environment: 'development' | 'staging' | 'production';
  /** Desired container replica count */
  replicas?: number;
  /** Docker image tag or digest */
  imageTag: string;
}

/**
 * Deploy or update containerized microservice to target cluster.
 * @param config Deployment configuration options
 */
export async function deployMicroservice(config: DeployConfig): Promise<{ success: boolean; deploymentId: string }> {
  console.log(\`Deploying \${config.imageTag} to \${config.clusterId} (\${config.environment}) with \${config.replicas || 2} replicas...\`);
  return {
    success: true,
    deploymentId: \`dep-\${Date.now()}\`
  };
}

/**
 * Query high-resolution CPU and memory telemetry for a cluster.
 * @param clusterId Target cluster identifier
 * @param timeWindow Time window in minutes to inspect
 */
export const queryClusterMetrics = async (clusterId: string, timeWindow: number = 15): Promise<{ cpuUsage: number; memoryUsage: number }> => {
  console.log(\`Querying metrics for cluster \${clusterId} over last \${timeWindow}m...\`);
  return {
    cpuUsage: 42.5,
    memoryUsage: 68.2
  };
};

/**
 * Permanently terminate an idle cluster and release allocated VPC resources.
 * @param clusterId Target cluster identifier to purge
 * @param drainSeconds Seconds to wait for existing connections to drain
 */
export async function terminateCluster(clusterId: string, drainSeconds: number = 30): Promise<{ terminated: boolean }> {
  console.log(\`Terminating cluster \${clusterId} after draining for \${drainSeconds}s...\`);
  return {
    terminated: true
  };
}
`
  }
};

export function startWebServer(port = 3456) {
  const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // API: GET /api/presets
    if (url.pathname === '/api/presets' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(PRESETS));
      return;
    }

    // API: POST /api/compile
    if (url.pathname === '/api/compile' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const source = payload.source || '';
          const filename = payload.filename || 'input.spec';
          const targets = payload.targets || ['all'];
          const harden = payload.harden !== false;

          const result = PolySkillCompiler.compile(source, {
            filename,
            targets,
            hardenGuardrails: harden
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err: unknown) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      });
      return;
    }

    // API: POST /api/simulate
    if (url.pathname === '/api/simulate' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const ir = payload.ir as SkillIR;
          const toolName = payload.toolName as string;
          const args = payload.args as Record<string, unknown>;

          const result = SandboxRunner.simulateExecution(ir, toolName, args);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err: unknown) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      });
      return;
    }

    
    // API: POST /api/synthesize (Natural Language Skill Generator)
    if (url.pathname === '/api/synthesize' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          const prompt = payload.prompt || '';
          const provider = payload.provider || 'builtin';
          const apiKey = payload.apiKey;
          const model = payload.model;
          const targets = payload.targets || ['all'];

          // Step 1: Synthesize IR from Natural Language
          const ir = await NaturalLanguageSynthesizer.synthesize({
            prompt,
            provider,
            apiKey,
            model
          });

          // Step 2: Harden Guardrails
          ir.tools = GuardrailSynthesizer.synthesize(ir.tools, ir.guardrails);

          // Step 3: Run Audit
          const audit = GuardrailSynthesizer.audit(ir.tools, ir.guardrails);
          ir.metadata.safetyScore = audit.safetyScore;

          // Step 4: Generate Target Artifacts
          const targetFiles = TargetEmissions.emit(ir, targets);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ir,
            targetFiles,
            diagnostics: [
              { level: 'info', message: `Synthesized '${ir.displayName}' via ${provider} synthesizer` }
            ],
            auditReport: audit
          }));
        } catch (err: unknown) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      });
      return;
    }
  
    // Static Files
    let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);

    // Fallback if looking in project root
    if (!fs.existsSync(filePath)) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.ico': 'image/x-icon'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });

  server.listen(port, () => {
    console.log(pc.cyan(`\n✨ PolySkill Web Studio is running!`));
    console.log(pc.green(`   URL: ${pc.bold(pc.underline(`http://localhost:${port}`))}\n`));
    console.log(pc.gray(`   Press Ctrl+C to stop.`));
  });

  return server;
}
