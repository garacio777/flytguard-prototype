# System Specification: FlytGuard AI Dispatch Prototype

## 1. Objective
Convert unstructured Norwegian natural-language field requests into deterministic, schema-validated equipment dispatch payloads — accessible via both a zero-SSR static web UI and a stateless Model Context Protocol (MCP) Streamable HTTP server — with zero public server runtime exposure.

## 2. 4-Zone Assume Breach Architecture
1. **Zone 1 — Read-Only Public Edge (`src/pages/`):** Built with Astro (`output: 'static'`) portable across Cloudflare Pages (`public/_headers`, `wrangler.jsonc`) and Vercel Edge (`vercel.json`). Ships flat static HTML/CSS with strict CSP (`script-src 'self'`, `style-src 'self'`), eliminating public RCE, SQLi, and SSR deserialization surfaces.
2. **Zone 2 — Air-Gapped Admin Plane:** Equipment inventory and internal ERP states reside inside a private VPC with zero public ports, accessible only via Cloudflare Zero Trust / Tailscale tunnels with hardware FIDO2 MFA.
3. **Zone 3 — Ephemeral Build & Sanitization Gate (`.github/workflows/ci-gate.yml`):** Ephemeral CI containers compile static assets, enforce TypeScript/Zod types, run Semgrep SAST and Gitleaks secret scans, strip `.map` artifacts, enforce 1:1 security header parity across `_headers` and `vercel.json`, and verify semantic DOM and HTTP status codes before deployment.
4. **Zone 4 — Isolated Dynamic Micro-Perimeter (`functions/api/` + thin `api/` Edge adapters):** Natural-language REST parsing (`/api/parse-dispatch`) and Remote MCP tool execution (`/api/mcp` over MCP `2025-03-26` Streamable HTTP JSON-RPC 2.0) run on stateless Edge Workers. All user inputs, MCP tool arguments, and LLM/parser JSON outputs must pass strict Zod `.safeParse()` validation before execution.

## 3. Failure Modes & Mitigations
- **Prompt-Only Security Fallacy:** AI coding assistants bypass prompt instructions in 28%–50% of debugging loops due to RLHF completion bias. Every rule in `CLAUDE.md` is backed by a deterministic CI check that fails the build on violation.
- **LLM Hallucination / Schema Drift:** Neither the LLM nor fallback parsers are trusted to return valid state directly. Every response is constrained by `DispatchOutputSchema` (Zod `.strict()`) with closed enum equipment categories (`EquipmentCategoryEnum`) and ISO-8601 timezone-offset validation.
