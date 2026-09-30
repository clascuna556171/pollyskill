---
description: Enforces atomic, incremental commits and immediate git push for every feature or detail added to the codebase
globs: **/*
---

# Incremental Commit & Push Directive

Whenever you make any improvement, add a feature, fix a bug, or add documentation:
1. Verify `npm test` and `npm run build` pass cleanly.
2. Commit the changes immediately with a conventional commit message.
3. Push to `origin` immediately before moving to the next task.
4. Do NOT batch multiple unrelated features into a single delayed push.
