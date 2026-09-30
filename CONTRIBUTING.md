# Contributing to PolySkill ⚡

Thank you for your interest in contributing to **PolySkill**! PolySkill is built with high standards of systems architecture, zero-bloat runtime design, and strict deterministic safety.

---

## 🚀 Incremental Commit & Push Policy (MANDATORY)

PolySkill adheres to an **atomic, incremental commit-and-push discipline**:
- **Never batch unrelated features or make monolithic, delayed multi-feature dumps.**
- Every discrete unit of work (e.g. a new parser, an updated validator, a new CLI flag, or an added test suite) must be:
  1. Built and verified cleanly with `npm test` and `npm run build`.
  2. Staged: `git add <files>`.
  3. Committed using standard Conventional Commits (`feat(...)`, `fix(...)`, `test(...)`, `docs(...)`, `ci(...)`).
  4. Immediately pushed to the remote branch (`git push origin <branch>`).

---

## 🏛️ Architecture & Standards

1. **Zero Runtime Bloat**: Emitted targets (MCP servers, Antigravity runners) must remain 100% dependency-free, using only Node.js native APIs (`node:readline`, `node:http`, `node:process`).
2. **Strict TypeScript**: Never use `any`. Keep `tsconfig.json` compiling with 0 errors.
3. **Deterministic Safety Over Prompting**: Never rely solely on LLM prompt instructions for safety; enforce path boundaries, SSRF filters, and destructive confirmation gates in compiled runtime code.
4. **Test Everything**: All parsers, guardrail mutations, and target generators must have corresponding unit and integration tests under `tests/`.

---

## 🛠️ Local Development Workflow

```bash
# Clone the repository
git clone https://github.com/clascuna556171/pollyskill.git
cd pollyskill

# Install dependencies
npm install

# Compile TypeScript
npm run build

# Run native test suite (all tests must pass)
npm test

# Run the benchmark profiler
node bin/polyskill.js benchmark

# Launch the Visual Web Studio
npm run ui
```

---

## 🤝 Code of Conduct

PolySkill fosters an inclusive, respectful, and pragmatic open-source engineering community. Be constructive, thoughtful, and focus on elegant, maintainable code.
