# FlytGuard — Specs-First AI Dispatch & Remote MCP Prototype

[![Deterministic Security & Architecture Gate](https://github.com/garacio777/flytguard-prototype/actions/workflows/ci-gate.yml/badge.svg)](https://github.com/garacio777/flytguard-prototype/actions/workflows/ci-gate.yml)

- **Live Web UI:** [https://flytguard-prototype.vercel.app](https://flytguard-prototype.vercel.app)
- **Live Remote MCP Endpoint (Streamable HTTP):** `https://flytguard-prototype.vercel.app/api/mcp`

**FlytGuard** converts unstructured Norwegian field requests (*"Vi trenger en 8-tonns gravemaskin og to lysmaster levert til byggeplass i Ås i morgen kl 07:00"*) into strictly validated, hallucination-proof equipment dispatch orders via both a zero-SSR static UI (`POST /api/parse-dispatch`) and a stateless **Model Context Protocol (MCP `2025-03-26`)** server (`POST /api/mcp`).

Built to demonstrate a disciplined **Specs-First AI Engineering** workflow for **Sørby Utleie** and **Snakker AS**: architectural boundaries (`docs/SPEC.md`), AI coding guardrails (`CLAUDE.md`), and deterministic CI failure gates (`.github/workflows/ci-gate.yml`) are locked in Git *before* application code is introduced.

---

## 1. Repository Architecture

```text
flytguard-prototype/
├── docs/
│   └── SPEC.md                        # Specs-first 4-Zone architecture & threat model
├── CLAUDE.md                          # AI coding rules mapped 1:1 to CI failure gates
├── tsconfig.json                      # Strict TypeScript configuration ("strict": true)
├── astro.config.mjs                   # Static edge output, external CSS, zero sourcemaps
├── wrangler.jsonc                     # Cloudflare Pages & Workers deployment config
├── vercel.json                        # Vercel Edge build & 1:1 security header parity
├── public/
│   ├── _headers                       # Hardened Cloudflare Edge CSP, HSTS & CORP headers
│   └── favicon.svg                    # Minimal static vector mark
├── src/
│   ├── pages/
│   │   ├── index.astro                # Zone 1: Pre-rendered static Norwegian dispatch UI
│   │   └── 404.astro                  # Hard 404 route (prevents soft-404 crawl traps)
│   ├── schemas/
│   │   ├── dispatch.ts                # Deterministic Zod input & LLM output contracts
│   │   └── mcp.ts                     # Strict JSON-RPC 2.0 & MCP Streamable HTTP schemas
│   ├── scripts/
│   │   └── dispatch-client.ts         # Strictly typed DOM client (zero innerHTML / any)
│   └── styles/
│       └── global.css                 # External stylesheet compliant with style-src 'self'
├── functions/
│   ├── api/
│   │   ├── parse-dispatch.ts          # Zone 4: Stateless Cloudflare Worker REST endpoint
│   │   └── mcp.ts                     # Zone 4: Stateless Cloudflare Worker MCP server
│   └── lib/
│       ├── dispatch-engine.ts         # Shared Gate 1 + Gate 2 + Gate 3 execution pipeline
│       └── norwegian-fallback-parser.ts # Deterministic Norwegian parser when key is unset
├── api/
│   ├── parse-dispatch.ts              # Thin Vercel Edge runtime adapter -> functions/api/
│   └── mcp.ts                         # Thin Vercel Edge runtime adapter -> functions/api/
└── .github/
    └── workflows/
        └── ci-gate.yml                # Zone 3: Ephemeral build, SAST & header parity gate
```

---

## 2. Guardrail-to-CI Enforcement Matrix

| Rule in `CLAUDE.md` | Enforcing Gate in `.github/workflows/ci-gate.yml` |
| :--- | :--- |
| Supply-chain postinstall script blocking | `npm ci --ignore-scripts` |
| Strict types, zero `any`, immutable Zod contracts | **Gate 1:** `npx tsc --noEmit` |
| Zero hardcoded API keys or leaked tokens | **Gate 2:** `gitleaks/gitleaks-action@v2` |
| Zero `innerHTML`, `eval()`, or OWASP Top 10 sinks | **Gate 3:** `semgrep/semgrep-action@v1` (`p/typescript`, `p/owasp-top-ten`) |
| Static compilation (`output: 'static'`) | **Gate 4:** `npm run build` |
| Zero `.map` source maps, zero framework meta footprint, canonical + `<main>` + hard `404` + `_headers`/`vercel.json` parity | **Gate 5:** Forensic `dist/` artifact, header parity & DOM gate |

---

## 3. Remote Model Context Protocol (MCP) Integration

FlytGuard exposes 3 Zod-guarded MCP tools over **Streamable HTTP (`2025-03-26`)** at `/api/mcp` with zero external runtime bloat:

1. `parse_norwegian_dispatch` — Parses Norwegian construction equipment requests (`projectSiteId` + `rawMessage`) through Gate 1 + Gate 2 + Gate 3 into `DispatchOutput`.
2. `validate_dispatch_payload` — Audits an untrusted candidate dispatch JSON object against `DispatchOutputSchema` (`.strict()`).
3. `list_equipment_catalog` — Lists `EquipmentCategoryEnum` categories, Norwegian specifications, and operator certification rules (`M2`/`M4`).

### Connect in Antigravity (`~/.gemini/config/mcp_config.json`)
```json
{
  "mcpServers": {
    "cloudflare": {
      "url": "https://mcp.cloudflare.com/mcp"
    },
    "flytguard-dispatch": {
      "url": "https://flytguard-prototype.vercel.app/api/mcp"
    }
  }
}
```

### Connect in Claude Desktop / Cursor (`mcp-remote`)
```json
{
  "mcpServers": {
    "flytguard-dispatch": {
      "command": "npx",
      "args": ["mcp-remote", "https://flytguard-prototype.vercel.app/api/mcp"]
    }
  }
}
```

---

## 4. Verification Commands

### Build & Run CI Checks Locally
```bash
npm ci --ignore-scripts
npx tsc --noEmit
npm run build
```

### Deploy to Cloudflare Pages (`wrangler.jsonc`)
```bash
npx wrangler pages deploy dist --project-name flytguard-prototype
```

### Live Endpoint Verification (`curl`)
```bash
# 1. REST Dispatch Endpoint (HTTP 200 VALIDATED)
curl -i -X POST https://flytguard-prototype.vercel.app/api/parse-dispatch \
  -H "Content-Type: application/json" \
  -d '{"projectSiteId":"PROJ-1042","rawMessage":"Vi trenger en 8-tonns gravemaskin og to lysmaster levert til byggeplass i Ås i morgen kl 07:00"}'

# 2. MCP Streamable HTTP tools/list (JSON-RPC 2.0)
curl -X POST https://flytguard-prototype.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
