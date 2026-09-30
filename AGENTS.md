# PolySkill Agent & Contributor Directives

## 🚀 Incremental Commit & Push Policy (MANDATORY)

**Rule: Every single detail, feature, or atomic improvement MUST be tested, committed, and pushed incrementally immediately upon completion.**

- **Never perform large, monolithic, multi-feature batch commits or delayed single-push dumps.**
- Follow the atomic commit discipline:
  1. Complete a cohesive, discrete unit of work (e.g. a new parser, an updated validator, a new CLI flag, or an added test).
  2. Verify that `npm test` and `npm run build` pass 100% cleanly.
  3. Immediately stage the modified files: `git add <files>`
  4. Create a descriptive conventional commit:
     - `feat(...)`: for new features or capabilities
     - `fix(...)`: for bug fixes or edge-case handling
     - `test(...)`: for new or updated test suites
     - `docs(...)`: for documentation and project context
     - `refactor(...)`: for code cleanup without behavior change
  5. Push the commit to the remote repository immediately:
     ```bash
     git push origin <branch>
     ```
  6. Only after pushing proceed to the next discrete task in the plan.

## 🛠️ Code Quality & Architecture Standards

1. **Zero Runtime Bloat**: Generated code (MCP servers, Antigravity runners) must remain 100% dependency-free, relying strictly on Node.js built-in APIs (`node:readline`, `node:process`, etc.).
2. **Strict TypeScript**: Never use `any` type escapes. Ensure [tsconfig.json](file:///c:/Users/Sebaz/polyskill/tsconfig.json) compiles with 0 errors (`npm run build`).
3. **Deterministic Safety Over Prompting**: Never rely solely on LLM prompt instructions for safety; enforce path boundaries, command sanitization, and destructive confirmation gates in compiled runtime code.
4. **Test Everything**: All parsers, guardrail mutations, and target generators must have corresponding unit and integration tests under `tests/`.
