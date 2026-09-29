# ⚡ PolySkill

> **The Universal Static Compiler for Agent Skills.**  
> Parse any local Python script, CLI tool, OpenAPI specification, or business runbook and compile it into zero-dependency, sandboxed skill packages targeting **Google Antigravity**, **Model Context Protocol (MCP)**, **Cursor / Windsurf**, and **OpenAI Function Calling**.

[![Tests](https://img.shields.io/badge/tests-13%2F13%20passing-10b981.svg)](#testing--verification)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero-Cost](https://img.shields.io/badge/cost-$0%20local-a855f7.svg)](#zero-cost-infrastructure)
[![Target Runtimes](https://img.shields.io/badge/targets-Antigravity%20|%20MCP%20|%20Cursor%20|%20OpenAI-0284c7.svg)](#multi-target-matrix)

---

## 💡 Why This Exists (The Problem)

Every AI agent framework defines "skills" differently:
- **Google Antigravity** expects a `skills/<name>/SKILL.md` directory with YAML frontmatter, runtime runner scripts, markdown workflows, and reference docs.
- **Model Context Protocol (MCP)** demands a stdio or SSE JSON-RPC 2.0 server implementing protocol handshakes, schema negotiation, and tool call handlers.
- **Cursor & Windsurf** rely on high-density prompt rules (`.cursorrules` / `.windsurfrules`).
- **OpenAI & Anthropic** require specific JSON schema tool arrays.

Before **PolySkill**, turning an internal company script or REST API into agent skills meant manually writing custom boilerplate for each format, hand-coding parameter schemas, and praying the agent wouldn't hallucinate destructive shell commands or path traversal attacks.

**PolySkill acts like LLVM for Agent Skills:**
1. **Frontend Parsers** ingest arbitrary inputs without executing untrusted code.
2. An **Intermediate Representation (Skill IR)** normalizes operations, parameter types, and risk levels.
3. A **Guardrail Synthesizer** automatically audits code and injects deterministic safety wrappers (path traversal filters, destructive confirmation gates, dry-run simulation).
4. **Backend Generators** emit production-grade, zero-dependency artifacts across all agent ecosystems in milliseconds.

---

## 🏛️ Architecture & Compiler Pipeline

```
  INPUT SOURCES (Frontends)
  ┌───────────────────────┐   ┌───────────────────────┐   ┌───────────────────────┐
  │   Python / CLI Scripts│   │ OpenAPI v3 / Swagger  │   │  SkillSpec Manifest   │
  │   (AST & Docstrings)  │   │  (JSON / YAML APIs)   │   │  (Domain Runbooks)    │
  └───────────┬───────────┘   └───────────┬───────────┘   └───────────┬───────────┘
              │                           │                           │
              └─────────────────────┬─────┴───────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │     Universal Parser Core     │
                    │   (Static AST / Type Lexer)   │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │      Universal Skill IR       │
                    │   • Normalized JSON Schemas   │
                    │   • Risk Level Classification │
                    │   • Workflow Directives       │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │     Guardrail Synthesizer     │
                    │   🛡️ Path Traversal Blocks    │
                    │   🛑 Destructive Gates        │
                    │   🧪 Auto-Injected DryRun     │
                    │   📊 Safety Score Engine      │
                    └───────────────┬───────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
         ▼                          ▼                          ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│Google Antigravity│       │    MCP Server    │       │   Cursor Rules   │
│ • SKILL.md       │       │ • stdio JSON-RPC │       │ • .cursorrules   │
│ • scripts/runner │       │ • zero-dependency│       │ • .windsurfrules │
│ • references/SPEC│       │ • config snippet │       │ • OpenAI tools   │
└──────────────────┘       └──────────────────┘       └──────────────────┘
```

---

## ⚡ The 10-Second Demo

Compile a raw Python maintenance script into every agent skill format in **40 milliseconds**:

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
  ✔ Emitted: dist/cursor/billing-ops/.cursorrules
  ✔ Emitted: dist/cursor/billing-ops/.windsurfrules
  ✔ Emitted: dist/api-tools/billing-ops/openai-tools.json
  ✔ Emitted: dist/api-tools/billing-ops/anthropic-tools.json

Compilation Summary:
  • Skill Name:   Billing Ops Skill (billing-ops)
  • Tools Count:  4 tools extracted
  • Safety Score: 95/100
  • Artifacts:    9 files in 0.04s
```

---

## 🚀 Quickstart Guide

### 1. Requirements
- Node.js 18+ (tested on Node v20 & v24)
- 100% free / local — zero API keys, zero cloud tokens.

### 2. Installation
```bash
git clone https://github.com/your-username/polyskill.git
cd polyskill
npm install
npm run build
```

### 3. CLI Commands

#### Synthesize Skills with Natural Language
Synthesize any custom skill (e.g. UI/UX design, security auditor) from a plain English prompt:
```bash
node bin/polyskill.js create "UI/UX design auditor that checks Apple HIG compliance" -o ./dist
```

#### Statically Inspect Any Source
Inspect extracted functions, schemas, and safety scores without generating files:
```bash
node bin/polyskill.js inspect examples/billing-ops.py
```

#### Output Bare Markdown to Terminal / Clipboard
Stream clean, unadulterated `SKILL.md` directly to stdout:
```bash
node bin/polyskill.js print-md examples/billing-ops.py
```

#### Compile to Selected Targets
Compile to specific runtimes (`antigravity`, `mcp`, `cursor`, `openai`):
```bash
node bin/polyskill.js compile examples/stripe-billing.json -t antigravity,mcp -o ./dist
```

#### Simulate & Verify Guardrail Enforcement
Test tools in the isolated local sandbox to verify safety policies:

```bash
# 1. Unconfirmed destructive call -> BLOCKED
node bin/polyskill.js test examples/cloud-sre.yaml \
  --tool rollback_deployment \
  --args '{"cluster_name":"prod","service_name":"auth","confirm":false,"dryRun":false}'

# 2. Path traversal attack attempt -> BLOCKED
node bin/polyskill.js test examples/billing-ops.py \
  --tool refund_charge \
  --args '{"charge_id":"../../etc/shadow","amount_cents":1000}'

# 3. Dry-run simulation -> PERMITTED
node bin/polyskill.js test examples/cloud-sre.yaml \
  --tool rollback_deployment \
  --args '{"cluster_name":"prod","service_name":"auth","dryRun":true}'
```

#### Launch the Visual Web Studio
Launch the local visual playground:
```bash
npm run ui
# Opens http://localhost:3456
```

---

## 🌐 Visual Web Studio

PolySkill comes with a local, zero-dependency browser studio featuring:
- **Linear/Apple Dark Mode**: Deep slate background, neon status badges, split 3-pane responsive layout.
- **Preset Loaders**: 1-click loading of Stripe OpenAPI, Postgres Python CLI, and AWS ECS Runbooks.
- **Live Compiler**: Instant AST generation and security scoring on every keystroke (`Ctrl+Enter`).
- **Target Artifact Switcher**: Live previews of generated `SKILL.md`, `mcp-server.mjs`, and `.cursorrules`.
- **Interactive Exploit Tester**: Click "Test Path Traversal Exploit" to watch deterministic guardrails intercept simulated attacks in real time.

---

## 🛡️ Deterministic Guardrails Engine

PolySkill injects security barriers directly into emitted code:

| Guardrail | Mechanism | Violation Action |
|---|---|---|
| **Path Traversal Protection** | Regex regex-scans all string parameters for `../`, `..\`, `/etc`, Windows roots | Immediate runtime abort (`GUARDRAIL_BLOCKED`) |
| **Destructive Mutation Gate** | Detects `drop`, `delete`, `purge`, `truncate` keywords in tool names and descriptions | Requires explicit `confirm: true` or `dryRun: true` |
| **Dry-Run Auto-Injection** | Synthesizes a `dryRun: boolean` parameter into every non-read-only tool | Simulates execution with 0 state mutations |
| **Command Injection Guard** | Blocks shell separators (`;`, `|`, `&&`, backticks, `$()`) in path/string arguments | Intercepted before shell invocation |
| **Timeout Bounds** | Enforces a strict default 30s execution ceiling | SIGTERM / process abort |

---

## 🧪 Testing & Verification

Run the full end-to-end test suite:
```bash
npm test
```

### Test Coverage Highlights:
- **`tests/parsers.test.ts`**: Verifies AST extraction for Python docstrings, type annotations, and OpenAPI path schemas.
- **`tests/guardrails.test.ts`**: Verifies audit heuristics and auto-injection of `dryRun` and `confirm` parameters.
- **`tests/compiler.test.ts`**: End-to-end integration tests compiling real sources into valid artifacts across all targets.
- **`tests/sandbox.test.ts`**: Tests runtime prevention of path traversal attacks, command injection, and unconfirmed purges.

```text
▶ PolySkill Compiler End-to-End Suite
  ✔ compiles Python source across all target formats
  ✔ compiles OpenAPI specification and generates valid targets
▶ Guardrail Synthesizer & Audit Test Suite
  ✔ audit flags missing confirmation on destructive tool
  ✔ synthesize auto-injects dryRun and confirm parameters
▶ PolySkill Parsers Test Suite
  ✔ OpenAPIParser parses endpoints and assigns risk levels
  ✔ ScriptParser extracts functions, docstrings, and types from Python
  ✔ ManifestParser correctly ingests SkillSpec YAML
  ✔ UniversalParser auto-detects file types accurately
▶ PolySkill Sandbox & Security Guardrail Suite
  ✔ blocks path traversal attack attempting ../ access
  ✔ blocks command injection characters
  ✔ blocks unconfirmed destructive tool invocation
  ✔ allows destructive tool when dryRun is enabled
  ✔ allows destructive tool when explicitly confirmed
ℹ tests 13 | pass 13 | fail 0
```

---

## 📂 Project Structure

```
polyskill/
├── bin/
│   └── polyskill.js          # Executable CLI wrapper
├── src/
│   ├── index.ts              # Programmatic API exports
│   ├── compiler.ts           # End-to-end compilation pipeline
│   ├── ir/
│   │   ├── types.ts          # Universal Skill IR definitions
│   │   └── validator.ts      # IR structural validation
│   ├── parsers/
│   │   ├── index.ts          # Universal parser auto-detector
│   │   ├── openapi.ts        # OpenAPI v2/v3 JSON & YAML parser
│   │   ├── script.ts         # Python / TypeScript static AST parser
│   │   └── manifest.ts       # Declarative SkillSpec YAML parser
│   ├── guardrails/
│   │   ├── types.ts          # Security finding and audit types
│   │   └── synthesizer.ts    # Deterministic guardrail synthesizer
│   ├── generators/
│   │   ├── index.ts          # Target coordinator
│   │   ├── antigravity.ts    # Google Antigravity Skill format
│   │   ├── mcp.ts            # Standalone stdio MCP server (JSON-RPC 2.0)
│   │   ├── cursor.ts         # .cursorrules & .windsurfrules
│   │   └── openai.ts         # OpenAI & Anthropic tool schemas
│   ├── sandbox/
│   │   └── runner.ts         # Safe local test simulator
│   ├── cli/
│   │   └── index.ts          # Commander CLI implementation
│   └── ui/
│       ├── server.ts         # Native zero-dep local HTTP server
│       └── public/           # Modern visual Web Studio
├── examples/
│   ├── billing-ops.py        # Python CLI fixture
│   ├── stripe-billing.json   # OpenAPI v3 fixture
│   └── cloud-sre.yaml        # SRE SkillSpec fixture
└── tests/                    # Comprehensive unit & integration tests
```

---

## 📜 License

MIT License. Designed and crafted with precision for pragmatic hackers and open-source creators.
