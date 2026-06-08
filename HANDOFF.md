# Handoff — Antigravity / TimeTrack
**Date:** 2026-06-08  
**Repo:** https://github.com/carlosrabadan059-cpu/Timetrack  
**Branch:** `main` (commit `fa96904`)

---

## What happened this session

### Graphify installed and graph built
- Installed `graphifyy` via `pipx install graphifyy`
- Ran `graphify claude install` from the project root, which:
  - Added a `## graphify` section to `CLAUDE.md` with query/path/explain rules
  - Registered `PreToolUse` hooks in `.claude/settings.json` (Bash search + Read/Glob)
- Built the code-only knowledge graph with `graphify update .`:
  - **3,536 nodes, 3,658 edges, 381 communities**
  - Output: `graphify-out/graph.json`, `graphify-out/graph.html`, `graphify-out/GRAPH_REPORT.md`
- Added `graphify-out/cache/` to `.gitignore` (generated AST files, not worth tracking)

### Agent skills added
- `.agents/skills/` populated with skills (caveman, diagnose, grill-me, grill-with-docs, handoff, improve-codebase-architecture, prototype, tdd, to-issues, to-prd, triage, write-a-skill, zoom-out)
- `docs/agents/` added with domain, issue-tracker, and triage-labels docs

### All changes committed and pushed
- Commit `fa96904`: `chore: instalar graphify y añadir skills de agente`

---

## Current project state

The project is **fully implemented** (Phases 0–5 complete). No active bugs or pending work from this session.

See `CLAUDE.md` for full architecture reference — do not re-derive from code what is already documented there.

Key facts:
- Backend: Node.js + Hono + Supabase, deployed on Raspberry Pi via Cloudflare Tunnel (`https://api.rabadanhouse.space`)
- Frontend: React 19 + Vite, deployed on Vercel
- 2N Access Commander integration via REST + SignalR
- n8n for async workflows (user sync, incidencias, reconciliation)

---

## How to use the knowledge graph

```bash
# Focused question (preferred — much smaller than grepping)
graphify query "how does the fichar endpoint work"

# Relationship between two nodes
graphify path "POST /api/me/fichar" "access_logs"

# Explain a concept
graphify explain "SignalR listener"

# Update after code changes (no API key needed)
graphify update .
```

The graph does NOT include docs/images (no LLM key was provided). To add semantic extraction for docs, set `ANTHROPIC_API_KEY` and run `graphify .`.

---

## Suggested skills

- **`antigravity-backend`** — always load before touching backend routes, Supabase schema, SignalR, n8n workflows, or fichaje logic
- **`graphify`** — use before any codebase exploration; `graphify-out/` exists and is populated
- **`verification-before-completion`** — run before claiming any fix or feature is done
- **`requesting-code-review`** — invoke before merging significant changes
