# AI Coding Contract & Architecture Guardrails

You are operating inside a strict Specs-First repository. Every rule below is enforced by an automated CI gate in `.github/workflows/ci-gate.yml`. Violating any rule will fail the build.

## 1. Architecture Boundaries
- **Static Edge Default:** Keep Astro configured as `output: 'static'`. Never enable SSR or React Server Components on public routes.
- **Dynamic Isolation:** All core dispatch parsing, LLM calls, and MCP tool logic must live exclusively inside `functions/` as stateless Edge Workers (`api/` may contain only thin stateless Edge runtime pass-through adapters).
- **Zero Telemetry Leakage:** Never reuse third-party analytics IDs, error tokens, or external script CDNs across templates.

## 2. Type & Schema Discipline (Enforced by `tsc --noEmit`)
- Never use `any`, `@ts-ignore`, or `@ts-expect-error`.
- Every external API request, MCP JSON-RPC message, and LLM/parser response MUST be parsed through a Zod `.safeParse()` schema imported from `src/schemas/` before accessing properties.

## 3. Security & Supply Chain (Enforced by Semgrep, Gitleaks & npm ci)
- Never use `innerHTML`, `dangerouslySetInnerHTML`, or `eval()`.
- Never hardcode API keys or tokens; read secrets strictly from runtime `env`.
- Do not add external npm packages without explicit approval; CI enforces `npm ci --ignore-scripts`.

## 4. Forensic DOM, Header Parity & Build Hygiene (Enforced by CI Artifact Gate)
- Production builds must never emit `.js.map` source maps or framework generator meta tags.
- `public/_headers` (Cloudflare Pages) and `vercel.json` (Vercel Edge) must maintain 1:1 parity across `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, and `Cross-Origin-Resource-Policy`.
- Every page must include a self-referencing `<link rel="canonical">`, semantic HTML5 landmarks, and return exact HTTP `404` status codes for missing routes.
