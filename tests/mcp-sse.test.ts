import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as http from 'node:http';
import { spawn, ChildProcess } from 'node:child_process';
import { PolySkillCompiler } from '../src/compiler.js';
import { MCPSSEGenerator } from '../src/generators/mcp-sse.js';

describe('MCP SSE Remote Transport Test Suite', () => {
  const samplePython = `
def query_metrics(metric_name: str, duration_minutes: int = 15) -> str:
    """Queries cluster operational metrics."""
    return f"metric={metric_name}"
`;

  test('MCPSSEGenerator generates valid SSE server code with event stream endpoints', () => {
    const compilation = PolySkillCompiler.compile(samplePython, { filename: 'metrics-ops.py', targets: ['mcp-sse'] });
    const sseFiles = MCPSSEGenerator.generate(compilation.ir);

    assert.ok(sseFiles['mcp/metrics-ops/mcp-sse-server.mjs'], 'Emits mcp-sse-server.mjs file');
    const code = sseFiles['mcp/metrics-ops/mcp-sse-server.mjs'];
    assert.ok(code.includes('text/event-stream'), 'Includes text/event-stream content type');
    assert.ok(code.includes('/sse'), 'Handles /sse endpoint');
    assert.ok(code.includes('/message'), 'Handles /message endpoint');
    assert.ok(code.includes('query_metrics'), 'Includes query_metrics tool definition');
  });

  test('Emitted MCP SSE server executes and handles HTTP /health and JSON-RPC /message', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyskill-sse-test-'));
    let serverProcess: ChildProcess | null = null;
    const testPort = 39876;

    try {
      const compilation = PolySkillCompiler.compile(samplePython, { filename: 'metrics-ops.py', targets: ['mcp-sse'] });
      const sseFiles = MCPSSEGenerator.generate(compilation.ir);
      const serverPath = path.join(tempDir, 'server.mjs');
      fs.writeFileSync(serverPath, sseFiles['mcp/metrics-ops/mcp-sse-server.mjs'], 'utf-8');

      // Spawn server
      serverProcess = spawn(process.execPath, [serverPath], {
        env: { ...process.env, PORT: String(testPort) },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Wait for server to start listening
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Server start timed out')), 4000);
        serverProcess?.stdout?.on('data', data => {
          if (data.toString().includes('listening on')) {
            clearTimeout(timeout);
            resolve();
          }
        });
        serverProcess?.on('error', reject);
      });

      // 1. Test GET /health
      const healthResponse = await new Promise<{ status: string; transport: string }>((resolve, reject) => {
        http.get(`http://localhost:${testPort}/health`, res => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
      });

      assert.strictEqual(healthResponse.status, 'ok');
      assert.strictEqual(healthResponse.transport, 'sse');

      // 2. Test POST /message JSON-RPC tools/list
      const rpcResponse = await new Promise<{ result: { tools: { name: string }[] } }>((resolve, reject) => {
        const req = http.request(`http://localhost:${testPort}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, res => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', reject);
        req.write(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list'
        }));
        req.end();
      });

      assert.ok(rpcResponse.result, 'Returns JSON-RPC result');
      assert.ok(rpcResponse.result.tools.some(t => t.name === 'query_metrics'), 'Lists query_metrics tool');

      // 3. Test POST /message JSON-RPC tools/call
      const callResponse = await new Promise<{ result: { content: { text: string }[] } }>((resolve, reject) => {
        const req = http.request(`http://localhost:${testPort}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, res => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', reject);
        req.write(JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'query_metrics',
            arguments: { metric_name: 'cpu_usage', duration_minutes: 30 }
          }
        }));
        req.end();
      });

      assert.ok(callResponse.result, 'Returns tool call result');
      const textOutput = JSON.parse(callResponse.result.content[0].text);
      assert.strictEqual(textOutput.success, true);
      assert.strictEqual(textOutput.tool, 'query_metrics');
    } finally {
      if (serverProcess) {
        serverProcess.kill('SIGTERM');
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
