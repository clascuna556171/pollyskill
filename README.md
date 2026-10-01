# ⚡ PolySkill

> **The Universal Static Compiler and Security Synthesizer for AI Agent Skills.**  
> Transform raw Python scripts, DevOps Bash scripts, OpenAPI specifications, and business runbooks into sandboxed, production-ready skill packages targeting **Google Antigravity**, **Model Context Protocol (MCP stdio & SSE)**, **Cursor / Windsurf**, and **OpenAI / Anthropic Function Calling**.

[![Tests](https://img.shields.io/badge/tests-49%2F49%20passing-10b981.svg)](#-testing--verification)
[![CI Matrix](https://img.shields.io/badge/CI-Ubuntu%20|%20macOS%20|%20Windows-blue.svg)](.github/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero-Cost](https://img.shields.io/badge/cost-$0%20local-a855f7.svg)](#-zero-cost-local-first-architecture)
[![Compilation Speed](https://img.shields.io/badge/latency-~2ms%20per%20skill-f59e0b.svg)](#-high-resolution-benchmarks)
[![Target Runtimes](https://img.shields.io/badge/targets-Antigravity%20|%20MCP%20stdio%2Fsse%20|%20Cursor%20|%20OpenAI-0284c7.svg)](#-multi-target-matrix)

---

## 📑 Table of Contents

- [💡 WHAT is PolySkill?](#-what-is-polyskill)
- [❓ WHY PolySkill? (The Problem in the Agent Era)](#-why-polyskill-the-problem-in-the-agent-era)
- [⚙️ HOW It Works (The Compiler Pipeline)](#️-how-it-works-the-compiler-pipeline)
- [📦 Installation & Setup](#-installation--setup)
- [⚡ 10-Second Quickstart Demo](#-10-second-quickstart-demo)
- [💻 CLI Command Reference](#-cli-command-reference)
- [🛡️ Deterministic Guardrails & Security Engine](#️-deterministic-guardrails--security-engine)
- [🎯 Multi-Target Matrix & Output Artifacts](#-multi-target-matrix--output-artifacts)
- [🌐 Visual Web Studio](#-visual-web-studio)
- [⏱️ High-Resolution Benchmarks](#️-high-resolution-benchmarks)
- [🧪 Testing & Verification](#-testing--verification)
- [📂 Project Structure](#-project-structure)
- [🤝 Contributing & Directives](#-contributing--directives)
- [📜 License](#-license)

---

## 💡 WHAT is PolySkill?

**PolySkill** is the **"LLVM for AI Agent Skills"**. It is a zero-dependency static compiler that ingests existing enterprise code (Python AST, TypeScript/JSDoc SDKs, DevOps Bash scripts, OpenAPI REST APIs, or plain-English intents) and deterministically compiles them into hardened, sandboxed tools for autonomous agents.

Rather than manually coding custom boilerplate for every AI runtime or trusting non-deterministic LLMs to "behave," PolySkill normalizes tools into a **Universal Skill Intermediate Representation (Skill IR)**, audits security, and **auto-synthesizes hard-coded runtime guardrails** (path traversal blockers, SSRF metadata shields, credential exfiltration gates, and destructive confirmation gates) in **~2 milliseconds with $0 cloud cost**.

---

## ❓ WHY PolySkill? (The Problem in the Agent Era)

### 1. The Protocol Wars & Tool Fragmentation Crisis
In 2025–2026, the AI agent ecosystem is intensely fragmented:
- **Google Antigravity** expects a `skills/<name>/SKILL.md` directory with YAML frontmatter, execution runner scripts, and reference docs.
- **Anthropic Claude** requires the **Model Context Protocol (MCP)** via JSON-RPC 2.0 over stdio or SSE.
- **Cursor & Windsurf** rely on high-density system prompts (`.cursorrules` / `.windsurfrules`).
- **OpenAI & Anthropic APIs** require strict JSON Schema tool arrays.

Before PolySkill, supporting all four runtimes meant writing and maintaining 4 distinct tool definitions for every internal API or script. **PolySkill provides write-once, compile-everywhere interoperability.**

### 2. The Enterprise "SecOps Wall" & Broken Prompt Safety
Over 80% of enterprise agent deployments are blocked by InfoSec and SecOps teams because **prompt-based guardrails** (`"Please do not delete data or read /etc"`) consistently fail under prompt injection, jailbreaks, and hallucinations.

**PolySkill replaces soft prompt instructions with deterministic compiled code**:
- Detects dangerous mutations (`drop`, `delete`, `purge`, `truncate`) and enforces mandatory `confirm: true` or `dryRun: true` flags.
- Regex-scans parameters to block directory traversal (`../`) and system paths (`/etc`, `C:\Windows\System32`).
- Blocks Server-Side Request Forgery (SSRF) targeting cloud metadata services (`169.254.169.254`) and private RFC 1918 subnets (`10.0.0.0/8`, `192.168.0.0/16`).
- Deterministically blocks raw credential exfiltration (AWS keys, OpenAI tokens, GitHub PATs, RSA private keys) in tool arguments, and auto-redacts sensitive secrets in tool outputs before returning to the agent.

### 3. $0 Local-First Economics vs Cloud LLM Latency
Why burn paid LLM tokens translating scripts at runtime when a static compiler can parse, validate, harden, and emit production-grade tools in **2 milliseconds**? PolySkill runs 100% locally with zero cloud dependencies.

---

## ⚙️ HOW It Works (The Compiler Pipeline)

```
                         ┌─────────────────────────────────────────────────────────┐
                         │                      INPUT SOURCES                      │
                         │  • Python Scripts (AST, Argparse, TypeHints, Docstrings)│
                         │  • TypeScript & JS SDKs (AST, Interfaces, Unions, JSDoc)│
                         │  • DevOps Bash Scripts (getopts, case flags, comments)  │
                         │  • OpenAPI v3 / Swagger (JSON & YAML)                   │
                         │  • Declarative SkillSpec Manifests                      │
                         │  • Natural Language Intent Prompts (Offline Heuristics) │
                         └────────────────────────────┬────────────────────────────┘
                                                      │
                                                      ▼
                         ┌─────────────────────────────────────────────────────────┐
                         │                 FRONTEND PARSER SUITE                   │
                         │  • Static extraction without executing untrusted code   │
                         │  • Regex AST tokenizers for Python / TS / Bash          │
                         │  • OpenAPI route & parameter normalizer                 │
                         └────────────────────────────┬────────────────────────────┘
                                                      │
                                                      ▼
                         ┌─────────────────────────────────────────────────────────┐
                         │              UNIVERSAL SKILL IR (IR Core)               │
                         │  • Normalized Tool Schema (JSON Schema draft-07)        │
                         │  • Risk Level Enum (read_only, idempotent, destructive) │
                         │  • Trigger Phrases, Workflows, Execution Metadata       │
                         └────────────────────────────┬────────────────────────────┘
                                                      │
                                                      ▼
                         ┌─────────────────────────────────────────────────────────┐
                         │             GUARDRAIL SYNTHESIZER & AUDIT               │
                         │  • Rule-based static vulnerability scanner              │
                         │  • Automated Safety Score Calculator (0 - 100)          │
                         │  • Auto-injects `confirm: boolean` on destructive tools │
                         │  • Auto-injects `dryRun: boolean` simulation flags      │
                         │  • Enforces path traversal, SSRF & credential shields   │
                         └────────────────────────────┬────────────────────────────┘
                                                      │
                                                      ▼
                         ┌─────────────────────────────────────────────────────────┐
                         │                 MULTI-TARGET CODEGEN                    │
                         ├─────────────────┬───────────────────┬───────────────────┤
                         ▼                 ▼                   ▼                   ▼
                 ┌───────────────┐ ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
                 │Google Antigrav│ │MCP stdio & SSE│   │ Cursor/Wind.  │   │OpenAI/Anthropic│
                 │• SKILL.md     │ │• stdio server │   │• .cursorrules │   │• Tool Calling │
                 │• runner.mjs   │ │• SSE server   │   │• .windsurfrules│  │  JSON Schemas │
                 │• SPEC.md      │ │• zero-dep     │   │• Context Prom.│   │  (draft-07)   │
                 └───────────────┘ └───────────────┘   └───────────────┘   └───────────────┘
```

---

## 📦 Installation & Setup

### Prerequisites
- **Node.js**: Version 18.0.0 or higher (tested on Node v20 LTS and v22).
- **Package Manager**: `npm` (bundled with Node.js).
- **Operating System**: macOS, Linux, or Windows (native PowerShell & CMD supported).

### 1. Clone & Build
```bash
git clone https://github.com/clascuna556171/pollyskill.git
cd pollyskill
npm install
npm run build
```

### 2. Link Globally (Optional)
To make the `polyskill` binary directly available anywhere in your terminal:
```bash
npm link
```
Verify the installation:
```bash
polyskill --version
# -> 1.0.0
```

---

## ⚡ 10-Second Quickstart Demo

Compile an example Python maintenance script into all target formats in **~30 milliseconds**:

```bash
node bin/polyskill.js compile examples/billing-ops.py -o ./dist
```

**Output:**
```text
⚡ PolySkill Compiler v1.0.0
   Source:  billing-ops.py
   Targets: all
   Output:  ./dist

  ✔ Emitted: dist/skills/billing-ops/SKILL.md
  ✔ Emitted: dist/skills/billing-ops/scripts/runner.mjs
  ✔ Emitted: dist/skills/billing-ops/references/SPEC.md
  ✔ Emitted: dist/mcp/billing-ops/mcp-server.mjs
  ✔ Emitted: dist/mcp/billing-ops/claude_desktop_config.json
  ✔ Emitted: dist/mcp/billing-ops/mcp-sse-server.mjs
  ✔ Emitted: dist/cursor/billing-ops/.cursorrules
  ✔ Emitted: dist/cursor/billing-ops/.windsurfrules
  ✔ Emitted: dist/api-tools/billing-ops/openai-tools.json
  ✔ Emitted: dist/api-tools/billing-ops/anthropic-tools.json

Compilation Summary:
  • Skill Name:   Billing Ops Skill (billing-ops)
  • Tools Count:  4 tools extracted
  • Safety Score: 100/100
  • Artifacts:    10 files in 0.03s
```

---

## 💻 CLI Command Reference

### 1. `compile` — Multi-Target Compilation
Compile any source into agent skills:
```bash
# Compile to all targets
node bin/polyskill.js compile examples/billing-ops.py -o ./dist

# Compile only to Antigravity and MCP
node bin/polyskill.js compile examples/stripe-billing.json -t antigravity,mcp -o ./dist

# Compile a DevOps shell script
node bin/polyskill.js compile examples/docker-cleanup.sh -o ./dist
```

### 2. `install` — 1-Click Mounting to Agent Apps
Directly mount compiled skills into local environments (Antigravity global directory, Claude Desktop configuration, and workspace Cursor rules):
```bash
# Live mounting to Antigravity global dir & Claude Desktop
node bin/polyskill.js install examples/billing-ops.py

# Test mounting in dry-run mode (simulates mounting with 0 disk writes)
node bin/polyskill.js install examples/billing-ops.py --dry-run
```

### 3. `benchmark` — High-Resolution Latency Telemetry
Profile compiler pipeline phases and calculate speedup vs cloud LLM roundtrips:
```bash
node bin/polyskill.js benchmark --iterations 5
```

### 4. `inspect` — Static AST & Security Inspection
Inspect extracted functions, schemas, and safety scores without generating files:
```bash
node bin/polyskill.js inspect examples/docker-cleanup.sh
```

### 5. `test` — Sandbox Simulation & Exploit Testing
Execute tools inside the local sandbox to verify guardrail enforcement:
```bash
# 1. Unconfirmed destructive call -> BLOCKED
node bin/polyskill.js test examples/cloud-sre.yaml \
  --tool rollback_deployment \
  --args '{"cluster_name":"prod","service_name":"auth","confirm":false,"dryRun":false}'

# 2. Path traversal attack attempt -> BLOCKED
node bin/polyskill.js test examples/billing-ops.py \
  --tool refund_charge \
  --args '{"charge_id":"../../etc/shadow","amount_cents":1000}'

# 3. SSRF / Cloud metadata exfiltration -> BLOCKED
node bin/polyskill.js test examples/stripe-billing.json \
  --tool finalize_invoice \
  --args '{"webhookUrl":"http://169.254.169.254/latest/meta-data/"}'

# 4. Dry-run simulation -> PERMITTED
node bin/polyskill.js test examples/cloud-sre.yaml \
  --tool rollback_deployment \
  --args '{"cluster_name":"prod","service_name":"auth","dryRun":true}'
```

### 6. `create` — Natural Language Skill Synthesis
Synthesize a skill from a plain-English prompt (works 100% offline or with BYOK API keys):
```bash
node bin/polyskill.js create "UI/UX design auditor that checks Apple HIG compliance" -o ./dist
```

### 7. `ui` — Launch the Visual Web Studio
Start the local visual playground:
```bash
npm run ui
# -> Opens http://localhost:3456
```

---

## 🛡️ Deterministic Guardrails & Security Engine

PolySkill injects security barriers directly into emitted code:

| Guardrail | Mechanism | Violation Action |
|---|---|---|
| **Path Traversal Protection** | Regex-scans all string parameters for `../`, `..\`, `/etc`, and Windows system roots | Immediate runtime abort (`GUARDRAIL_BLOCKED`) |
| **SSRF & Metadata Shield** | Blocks AWS/GCP IMDS (`169.254.169.254`), loopbacks (`127.0.0.1`), and RFC 1918 private subnets | Immediate runtime abort (`GUARDRAIL_BLOCKED`) |
| **Credential & Secret Shield** | Deterministically blocks raw API keys (AWS, OpenAI, GitHub, SSH/RSA) and auto-redacts output data | Ingress blocked (`GUARDRAIL_BLOCKED`) & outputs sanitized |
| **Destructive Mutation Gate** | Detects `drop`, `delete`, `purge`, `truncate`, `kill` in tool names and descriptions | Requires explicit `confirm: true` or `dryRun: true` |
| **Dry-Run Auto-Injection** | Synthesizes a `dryRun: boolean` parameter into every non-read-only tool | Simulates execution with 0 state mutations |
| **Command Injection Guard** | Blocks shell separators (`;`, `|`, `&&`, backticks, `$()`) in path/string arguments | Intercepted before shell invocation |
| **Timeout Bounds** | Enforces a strict default 30s execution ceiling | SIGTERM / process abort |

---

## 🎯 Multi-Target Matrix & Output Artifacts

| Target Runtime | Emitted Artifact | Description & Execution Model |
|---|---|---|
| **Google Antigravity** | `skills/<name>/SKILL.md`<br>`skills/<name>/scripts/runner.mjs`<br>`skills/<name>/references/SPEC.md` | Fully compliant Antigravity Skill package with YAML frontmatter, execution runner, and reference specs. |
| **Model Context Protocol (Stdio)** | `mcp/<name>/mcp-server.mjs`<br>`mcp/<name>/claude_desktop_config.json` | Standalone, zero-dependency JSON-RPC 2.0 stdio server ready to drop into Claude Desktop or Antigravity IDE. |
| **Model Context Protocol (SSE)** | `mcp/<name>/mcp-sse-server.mjs` | Standalone HTTP & Server-Sent Events transport server (`GET /sse`, `POST /message`) for remote agent hosting. |
| **Cursor & Windsurf** | `cursor/<name>/.cursorrules`<br>`cursor/<name>/.windsurfrules` | High-density IDE prompt instructions with embedded tool manifests and safety directives. |
| **Frontier API Tooling** | `api-tools/<name>/openai-tools.json`<br>`api-tools/<name>/anthropic-tools.json` | Strict JSON Schema (draft-07) function arrays compatible with OpenAI and Anthropic Claude APIs. |

---

## 🌐 Visual Web Studio

PolySkill comes with a local, zero-dependency browser studio featuring:
- **Linear/Apple Dark Mode**: Deep slate background, neon status badges, split 3-pane responsive layout.
- **Preset Loaders**: 1-click loading of Stripe OpenAPI, Postgres Python CLI, Docker DevOps Bash, and AWS ECS Runbooks.
- **Live Compiler**: Instant AST generation and security scoring on every keystroke (`Ctrl+Enter`).
- **Target Artifact Switcher**: Live previews of generated `SKILL.md`, `mcp-server.mjs`, and `.cursorrules`.
- **Interactive Exploit Tester**: Click "Test Path Traversal Exploit" to watch deterministic guardrails intercept simulated attacks in real time.

Launch the studio:
```bash
npm run ui
# Opens http://localhost:3456
```

---

## ⏱️ High-Resolution Benchmarks

PolySkill includes a built-in telemetry profiler that measures AST parsing, IR normalization, security audits, and codegen emission across real-world workloads:

```bash
node bin/polyskill.js benchmark --iterations 5
```

**Benchmark Results:**
```text
Execution Telemetry Matrix:
------------------------------------------------------------------------------------------------
Fixture                  | Type       | Tools  | Files  | Parse    | Audit    | Codegen  | Total
------------------------------------------------------------------------------------------------
billing-ops.py           | python     | 4      | 10     | 0.41ms   | 0.29ms   | 0.93ms   | 2.43ms
stripe-billing.json      | openapi    | 4      | 10     | 0.27ms   | 0.06ms   | 0.3ms    | 0.81ms
docker-cleanup.sh        | shell      | 1      | 10     | 0.27ms   | 0.04ms   | 0.24ms   | 0.65ms
cloud-sre.yaml           | skillspec  | 3      | 10     | 4.36ms   | 0.05ms   | 0.26ms   | 4.81ms
------------------------------------------------------------------------------------------------

Performance & Economic Metrics:
  • Average Compilation Latency: 2.18 ms
  • Compiler Throughput:         459 compiles/sec
  • Zero-Cost Cloud Advantage:   $0 (100% offline, zero API tokens)
  • LLM Comparison Speedup:     1606x faster than cloud LLM prompting (~3500ms)
```

---

## 🧪 Testing & Verification

PolySkill maintains **100% test pass rate** across all critical components:

```bash
# Run the complete test suite
npm test
```

### Test Suite Summary:
```text
▶ Bash / Shell Script Parser Test Suite (4 tests)
▶ Compiler Latency Benchmark Test Suite (1 test)
▶ PolySkill Compiler End-to-End Suite (2 tests)
▶ Credential & PII Guardrails Test Suite (11 tests)
▶ Guardrail Synthesizer & Audit Test Suite (2 tests)
▶ SkillInstaller & ConfigDetector Test Suite (5 tests)
▶ MCP SSE Remote Transport Test Suite (2 tests)
▶ NaturalLanguageSynthesizer Test Suite (3 tests)
▶ Network & SSRF Guardrails Test Suite (6 tests)
▶ PolySkill Parsers Test Suite (4 tests)
▶ PolySkill Sandbox & Security Guardrail Suite (5 tests)
▶ TypeScript / JSDoc AST Parser Test Suite (4 tests)

ℹ tests 49 | pass 49 | fail 0 | suites 12
```

---

## 📂 Project Structure

```text
polyskill/
├── bin/
│   └── polyskill.js              # Executable CLI wrapper
├── src/
│   ├── index.ts                  # Programmatic API exports
│   ├── compiler.ts               # End-to-end compilation pipeline
│   ├── ir/
│   │   ├── types.ts              # Universal Skill IR definitions
│   │   └── validator.ts          # IR structural validation
│   ├── parsers/
│   │   ├── index.ts              # Universal parser auto-detector
│   │   ├── openapi.ts            # OpenAPI v2/v3 JSON & YAML parser
│   │   ├── typescript.ts         # TypeScript / JSDoc static AST parser
│   │   ├── script.ts             # Python static AST parser
│   │   ├── bash.ts               # DevOps shell script parser
│   │   ├── natural.ts            # Offline semantic skill synthesizer
│   │   └── manifest.ts           # Declarative SkillSpec YAML parser
│   ├── guardrails/
│   │   ├── types.ts              # Security finding and audit types
│   │   ├── synthesizer.ts        # Deterministic guardrail synthesizer
│   │   ├── network.ts            # SSRF & cloud metadata egress guard
│   │   └── credential.ts         # Credential exfiltration & leak guard
│   ├── generators/
│   │   ├── index.ts              # Target coordinator
│   │   ├── antigravity.ts        # Google Antigravity Skill format
│   │   ├── mcp.ts                # Standalone stdio MCP server (JSON-RPC 2.0)
│   │   ├── mcp-sse.ts            # Remote HTTP / Server-Sent Events MCP server
│   │   ├── cursor.ts             # .cursorrules & .windsurfrules
│   │   └── openai.ts             # OpenAI & Anthropic tool schemas
│   ├── install/
│   │   ├── types.ts              # Installer type definitions
│   │   ├── detector.ts           # Antigravity & Claude Desktop path detector
│   │   └── installer.ts          # 1-click mounting engine
│   ├── benchmark/
│   │   └── runner.ts             # High-resolution telemetry profiler
│   ├── sandbox/
│   │   └── runner.ts             # Safe local test simulator
│   ├── cli/
│   │   └── index.ts              # Commander CLI implementation
│   └── ui/
│       ├── server.ts             # Native zero-dep local HTTP server
│       └── public/               # Modern visual Web Studio
├── examples/
│   ├── cloud-deploy.ts           # TypeScript SDK fixture
│   ├── billing-ops.py            # Python CLI fixture
│   ├── docker-cleanup.sh         # DevOps Bash fixture
│   ├── stripe-billing.json       # OpenAPI v3 fixture
│   └── cloud-sre.yaml            # SRE SkillSpec fixture
├── tests/                        # Comprehensive unit & integration tests (49 tests across 12 suites)
├── .github/workflows/ci.yml      # Multi-OS GitHub Actions matrix
├── AGENTS.md                     # Agent & contributor commit directives
├── CONTRIBUTING.md               # Contribution standards and guidelines
└── PROJECT_CONTEXT.md            # Recruiter & architectural deep dive
```

---

## 🤝 Contributing & Directives

PolySkill enforces an **Atomic Incremental Commit & Push Policy**:
- Every detail, feature, or improvement must be tested, committed with a descriptive conventional message (`feat(...)`, `fix(...)`, `test(...)`), and pushed immediately.
- See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) for complete directives.

---

## 📜 License

MIT License. Designed and crafted with precision for pragmatic hackers, AI engineers, and open-source creators.
