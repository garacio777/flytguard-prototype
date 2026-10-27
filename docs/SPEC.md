# System Specification: FlytGuard AI Dispatch Prototype

## 1. Objective
Convert unstructured Norwegian natural-language field requests into deterministic, schema-validated equipment dispatch payloads with zero public server runtime exposure.

## 2. 4-Zone Assume Breach Architecture
1. **Zone 1 — Read-Only Public Edge (`src/pages/`):** Built with Astro (`output: 'static'`) deployed to Cloudflare Pages. Ships flat static HTML/CSS with zero client-side JS by default, eliminating public RCE, SQLi, and SSR deserialization surfaces.
2. **Zone 2 — Air-Gapped Admin Plane:** Equipment inventory and internal ERP states reside inside a private VPC with zero public ports, accessible only via Cloudflare Zero Trust / Tailscale tunnels with hardware FIDO2 MFA.
3. **Zone 3 — Ephemeral Build & Sanitization Gate (`.github/workflows/ci-gate.yml`):** Ephemeral CI containers compile static assets, enforce TypeScript/Zod types, run Semgrep SAST and Gitleaks secret scans, strip `.map` artifacts, and verify semantic DOM and HTTP status codes before deployment.
4. **Zone 4 — Isolated Dynamic Micro-Perimeter (`functions/api/`):** Natural-language parsing runs on a stateless Edge Worker on an isolated origin. All user inputs and LLM JSON outputs must pass strict Zod schema validation before execution.

## 3. Failure Modes & Mitigations
- **Prompt-Only Security Fallacy:** AI coding assistants bypass prompt instructions in 28%–50% of debugging loops due to RLHF completion bias. Every rule in `CLAUDE.md` is backed by a deterministic CI check that fails the build on violation.
- **LLM Hallucination / Schema Drift:** The LLM is never trusted to return valid state or execute actions directly. Responses are constrained by `DispatchOutputSchema` (Zod) with strict enum equipment categories and ISO-8601 date validation.
