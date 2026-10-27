# FlytGuard — Specs-First AI Dispatch Prototype

**FlytGuard** converts unstructured Norwegian field requests (*"Vi trenger en 8-tonns gravemaskin og to lysmaster levert til byggeplass i Ås i morgen kl 07:00"*) into strictly validated, hallucination-proof equipment dispatch orders.

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
├── public/
│   ├── _headers                       # Hardened Edge CSP, HSTS, and framing headers
│   └── favicon.svg                    # Minimal static vector mark
├── src/
│   ├── pages/
│   │   ├── index.astro                # Zone 1: Pre-rendered static Norwegian dispatch UI
│   │   └── 404.astro                  # Hard 404 route (prevents soft-404 crawl traps)
│   ├── schemas/
│   │   └── dispatch.ts                # Deterministic Zod input & LLM output contracts
│   ├── scripts/
│   │   └── dispatch-client.ts         # Strictly typed DOM client (zero innerHTML / any)
│   └── styles/
│       └── global.css                 # External stylesheet compliant with style-src 'self'
├── functions/
│   └── api/
│       └── parse-dispatch.ts          # Zone 4: Isolated stateless Cloudflare Pages Worker
└── .github/
    └── workflows/
        └── ci-gate.yml                # Zone 3: Ephemeral build, SAST & forensic DOM gate
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
| Zero `.map` source maps, zero framework meta footprint, canonical + `<main>` + hard `404` | **Gate 5:** Forensic `dist/` artifact & DOM gate |

---

## 3. Local Verification & Development

### Install & Run Local CI Gates
```bash
npm ci --ignore-scripts
npx tsc --noEmit
npm run build
```

### Run Full Zone 1 + Zone 4 Cloudflare Pages Worker Locally
Create an untracked `.dev.vars` file in the project root (ignored by `.gitignore`):
```ini
OPENAI_API_KEY=your_api_key_here
```

Then serve the compiled static `dist/` folder with Cloudflare Pages Functions attached:
```bash
npx wrangler pages dev dist
```

### Sample API Verification (`POST /api/parse-dispatch`)

**Valid Request (`200 VALIDATED`):**
```bash
curl -X POST http://localhost:8788/api/parse-dispatch \
  -H "Content-Type: application/json" \
  -d '{
    "projectSiteId": "PROJ-1042",
    "rawMessage": "Vi trenger en 8-tonns gravemaskin og to lysmaster levert til byggeplass i Ås i morgen kl 07:00"
  }'
```

**Deterministic Gate 1 Rejection (`400 Bad Request`):**
```bash
curl -X POST http://localhost:8788/api/parse-dispatch \
  -H "Content-Type: application/json" \
  -d '{
    "projectSiteId": "INVALID",
    "rawMessage": "Kort"
  }'
```
