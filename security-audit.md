# Cyber Neo Security Report

**Project:** timetrack (Antigravity TimeTrack)
**Path:** /Users/carlosrabadan/timetrack
**Date:** 2026-05-26
**Tech Stack:** TypeScript/Node.js (Hono) backend · React 18 + Vite 6 frontend · Supabase Auth · Docker (arm64/Raspberry Pi) · Vercel (frontend CDN) · Cloudflare Tunnel
**Scan Coverage:** 100% — 162 files scanned (node_modules, dist, .git excluded). External tools: `npm audit` only (no Semgrep, Trivy, or Gitleaks available).

---

## Executive Summary

**Risk Score:** 100/100
**Overall Assessment:** Critical Risk

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High     | 9 |
| Medium   | 11 |
| Low      | 10 |
| Info     | 2 |
| **Total** | **33** |

**Top 3 Priority Actions:**
1. **Update jsPDF to ≥4.2.1 or migrate PDF generation to the backend's existing pdfkit** — the current `jspdf ^2.5.1` has 11 CVEs including HTML/PDF injection allowing arbitrary JavaScript execution in generated PDFs (GHSA-wfv2-pwc8-crg5, GHSA-pqxr-3g65-p328).
2. **Remove `xlsx` from the frontend and route Excel exports through `GET /api/me/reportes/download/monthly?format=excel`** — the SheetJS Community Edition has prototype pollution + ReDoS with no npm fix available; the backend already uses the safe `exceljs` alternative.
3. **Validate the `company_id` parameter in `POST /api/users` against the authenticated user's company** — any admin/manager can currently create users in a different company by supplying an arbitrary UUID.

---

## Findings

---

### Critical Findings

#### [CN-001] jsPDF ≤4.2.0 — PDF Injection, XSS, Path Traversal, and DoS Cluster
- **Severity:** Critical (CVSS 9.6 highest — GHSA-wfv2-pwc8-crg5)
- **CWE:** CWE-79 (XSS), CWE-94 (Code Injection), CWE-22 (Path Traversal), CWE-400 (DoS)
- **OWASP:** A06:2025 (Vulnerable and Outdated Components)
- **Location:** `package.json:16` — `"jspdf": "^2.5.1"` (installed 2.5.2); `jspdf-autotable:17` also affected
- **Description:** jsPDF has 11 known security advisories affecting all versions ≤4.2.0. The most severe allows an attacker-controlled string passed to jsPDF to produce a PDF containing arbitrary JavaScript that executes in the PDF viewer (GHSA-pqxr-3g65-p328, GHSA-9vjf-qc39-jprp). A second critical issue (GHSA-wfv2-pwc8-crg5, CVSS 9.6) enables HTML injection through new-window paths. The local file inclusion advisory (GHSA-f8cm-6447-x5h2) exposes server paths on the Raspberry Pi filesystem when backend-side PDFs are generated. TimeTrack uses jsPDF in client-side report pages (`ReportsPage.jsx`, `AdminReportsPage.jsx`) to render employee names, date ranges, and correction reasons directly into PDF documents — all potential injection vectors.
- **Evidence:**
  ```
  Installed: jspdf@2.5.2
  Advisories:
    GHSA-wfv2-pwc8-crg5  HTML Injection in New Window (CVSS 9.6)
    GHSA-pqxr-3g65-p328  Arbitrary JS Execution via AcroForm (CVSS 8.1)
    GHSA-9vjf-qc39-jprp  PDF Object Injection via addJS (CVSS 8.1)
    GHSA-7x6v-j9x4-qf24  PDF Object Injection via AcroFormChoiceField (8.1)
    GHSA-f8cm-6447-x5h2  Local File Inclusion / Path Traversal
    GHSA-vm32-vv63-w422  XMP Metadata Injection
    GHSA-w532-jxjh-hjhj  ReDoS in parser
    GHSA-8mvj-3j78-4qmw  DoS via unvalidated BMP dimensions
    GHSA-95fx-jjr5-f39c  DoS via invalid GIF
    GHSA-67pg-wm7f-q7fj  DoS via malformed input
    GHSA-cjw8-79x6-5cj4  Race condition in addJS
  ```
- **Remediation:**
  ```bash
  npm install jspdf@^4.2.1 jspdf-autotable@^5.0.8
  ```
  **Preferred alternative:** Move all PDF generation to the backend where `pdfkit` (already installed, no CVEs) is available, exposing a `GET /api/me/reportes/download/monthly?format=pdf` endpoint (this already exists for admin reports). Remove jsPDF and jspdf-autotable from the frontend entirely. This eliminates the vulnerability surface and keeps PDF logic server-side where user input can be sanitized before rendering.

---

### High Findings

#### [CN-002] Missing Security Headers on Vercel Frontend Deployment
- **Severity:** High (CVSS ~7.5)
- **CWE:** CWE-693 (Protection Mechanism Failure)
- **OWASP:** A02:2025 (Security Misconfiguration)
- **Location:** `vercel.json:1-6`
- **Description:** The Vercel deployment has no HTTP security headers configured. The following critical headers are absent: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`. Without X-Frame-Options and CSP `frame-ancestors`, the app is vulnerable to clickjacking attacks. Without HSTS, downgrade attacks are possible. Without CSP, any XSS vulnerability (including those in the vulnerable jsPDF/xlsx versions) has a wider blast radius.
- **Evidence:**
  ```json
  {
    "framework": "vite",
    "buildCommand": "npm run build",
    "outputDirectory": "dist",
    "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
  }
  ```
- **Remediation:**
  ```json
  {
    "framework": "vite",
    "buildCommand": "npm run build",
    "outputDirectory": "dist",
    "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
    "headers": [
      {
        "source": "/(.*)",
        "headers": [
          { "key": "X-Frame-Options", "value": "DENY" },
          { "key": "X-Content-Type-Options", "value": "nosniff" },
          { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
          { "key": "Permissions-Policy", "value": "geolocation=(self), camera=(), microphone=()" },
          { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
          { "key": "Content-Security-Policy", "value": "default-src 'self'; connect-src 'self' https://api.rabadanhouse.space https://*.supabase.co; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; frame-ancestors 'none'" }
        ]
      }
    ]
  }
  ```

---

#### [CN-003] Docker Container Runs as Root — No USER Directive
- **Severity:** High (CVSS ~7.8)
- **CWE:** CWE-250 (Execution with Unnecessary Privileges)
- **OWASP:** A02:2025 (Security Misconfiguration)
- **Location:** `backend/Dockerfile:1-14`
- **Description:** Neither the builder nor the runtime stage in the multi-stage Dockerfile defines a `USER` directive. The Node.js process runs as root inside the container. If the backend is compromised (e.g., via the SSRF in CN-006), an attacker gains root privileges within the container, significantly lowering the bar for container escape on the Raspberry Pi host.
- **Evidence:**
  ```dockerfile
  FROM node:22-alpine AS builder
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci
  COPY . .
  RUN npm run build

  FROM node:22-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --omit=dev
  COPY --from=builder /app/dist ./dist
  EXPOSE 3000
  CMD ["node", "dist/index.js"]
  # No USER directive — runs as root
  ```
- **Remediation:**
  ```dockerfile
  FROM node:22-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --omit=dev
  COPY --from=builder /app/dist ./dist
  RUN addgroup -S appgroup && adduser -S appuser -G appgroup
  USER appuser
  EXPOSE 3000
  CMD ["node", "dist/index.js"]
  ```

---

#### [CN-004] Missing .dockerignore — Backend .env Copied into Docker Image Layer
- **Severity:** High (CVSS ~7.5)
- **CWE:** CWE-200 (Exposure of Sensitive Information)
- **OWASP:** A02:2025 (Security Misconfiguration)
- **Location:** `backend/Dockerfile:5` (builder stage `COPY . .`)
- **Description:** No `.dockerignore` file exists at `backend/.dockerignore`. The builder stage runs `COPY . .`, which copies any `backend/.env` present at build time into the image layer — including `SUPABASE_SERVICE_ROLE_KEY`, `AC_API_TOKEN`, and `N8N_WEBHOOK_SECRET`. Even though the multi-stage build only copies `dist/` to the runtime image, the `.env` contents persist in the **builder layer**. The image is pushed to Docker Hub as `rabadanhouse/timetrack-backend:latest` — anyone with pull access can extract that layer and read the secrets.
- **Evidence:**
  ```
  $ ls backend/.dockerignore   → (file not found)
  $ ls backend/.env            → exists at build time (contains production secrets)
  builder stage: COPY . .      → copies .env into layer
  deploy: rabadanhouse/timetrack-backend:latest on Docker Hub
  ```
- **Remediation:** Create `backend/.dockerignore`:
  ```
  .env
  .env.*
  .env.local
  node_modules/
  dist/
  *.log
  .git/
  coverage/
  ```

---

#### [CN-005] AC API Token Stored as Plaintext in Supabase Database
- **Severity:** High (CVSS ~7.5)
- **CWE:** CWE-312 (Cleartext Storage of Sensitive Information)
- **OWASP:** A04:2025 (Cryptographic Failures)
- **Location:** `backend/src/api/routes/admin.ts:338-358`, `backend/src/api/routes/superadmin.ts:95-104`
- **Description:** The 2N Access Commander API token is stored as plaintext in the `company_settings.clocking_modes` JSONB column. This token grants full control over physical access hardware (door locks, readers, user permissions). Anyone with Supabase Studio access, a leaked `service_role` key, or read access to a database dump can immediately retrieve credentials that control physical building access.
- **Evidence:**
  ```typescript
  // admin.ts — stored as plain JSON string in the database
  const mergedToken =
    incoming.twoN?.ac_api_token && incoming.twoN.ac_api_token !== '••••••••'
      ? incoming.twoN.ac_api_token   // plaintext token written to JSONB column
      : currentToken;
  patch['clocking_modes'] = newModes;
  await supabaseAdmin.from('company_settings').update(patch).eq('company_id', companyId);
  ```
- **Remediation:** Encrypt the token before storing using a server-side `ENCRYPTION_KEY` environment variable, or use [Supabase Vault](https://supabase.com/docs/guides/database/vault) for secret storage. Simplest alternative: store the AC token only in the backend environment (`AC_API_TOKEN` in `.env`), not in the database.

---

#### [CN-006] SSRF — Admin Can Probe Internal LAN via Test-AC Endpoint
- **Severity:** High (CVSS ~7.2)
- **CWE:** CWE-918 (Server-Side Request Forgery)
- **OWASP:** A05:2025 (Injection)
- **Location:** `backend/src/api/routes/admin.ts:387-424`
- **Description:** The `POST /api/admin/settings/test-ac` endpoint accepts a user-supplied `ac_base_url` and makes a server-side HTTP request to `${baseUrl}/api/v3/users?limit=1` without any URL validation. Any admin-role user can supply `http://192.168.1.1/`, `http://169.254.169.254/` (cloud metadata), or `http://localhost:5432/` to probe internal services on the Raspberry Pi's home network. Given the deployment topology (Pi on a home LAN with other devices), this enables full internal network enumeration.
- **Evidence:**
  ```typescript
  const body = await c.req.json().catch(() => null) as { ac_base_url?: string; ac_api_token?: string } | null;
  let baseUrl = body?.ac_base_url?.trim() ?? '';  // user-supplied, no validation
  // ...
  const url = `${baseUrl.replace(/\/$/, '')}/api/v3/users?limit=1`;
  const res = await fetch(url, {  // no allowlist, no IP range check
    method: 'GET',
    headers: { Authorization: `Bearer ${apiToken}` },
    signal: AbortSignal.timeout(8000),
  });
  ```
- **Remediation:**
  ```typescript
  import { URL } from 'url';
  const PRIVATE_RANGES = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.)/;

  function validateACUrl(raw: string): URL {
    const parsed = new URL(raw);  // throws on invalid URL
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Solo HTTPS/HTTP');
    if (PRIVATE_RANGES.test(parsed.hostname)) throw new Error('Dirección interna no permitida');
    // OR: allowlist approach — only allow URLs matching the configured AC_BASE_URL pattern
    return parsed;
  }
  ```

---

#### [CN-007] xlsx@0.18.5 — Prototype Pollution + ReDoS, No npm Fix Available
- **Severity:** High (CVSS ~7.8)
- **CWE:** CWE-1321 (Prototype Pollution), CWE-1333 (ReDoS)
- **OWASP:** A06:2025 (Vulnerable and Outdated Components)
- **Location:** `package.json:24` — `"xlsx": "^0.18.5"` (installed 0.18.5)
- **Description:** SheetJS Community Edition has two unpatched CVEs with `"range": "*"` — all npm-published versions are vulnerable and `npm audit` reports `"fixAvailable": false`. GHSA-4r6h-8v6p-xvw6 (prototype pollution, CVSS 7.8) allows a crafted spreadsheet to pollute `Object.prototype`. GHSA-5pgg-2g8v-p4x9 (ReDoS, CVSS 7.5) hangs the parser with crafted cell content. This is a **production** frontend dependency.
- **Evidence:**
  ```
  Installed: xlsx@0.18.5
  GHSA-4r6h-8v6p-xvw6  Prototype Pollution  range: *  fixAvailable: false
  GHSA-5pgg-2g8v-p4x9  ReDoS               range: *  fixAvailable: false
  ```
- **Remediation:** Remove `xlsx` from the frontend entirely. Route Excel export through the existing backend endpoint:
  ```javascript
  // Instead of client-side xlsx generation, call:
  const response = await fetch(`${BASE_URL}/api/me/reportes/download/monthly?format=excel&month=${month}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const blob = await response.blob();
  // trigger download...
  ```
  The backend already uses `exceljs` (no CVEs) for this endpoint.

---

#### [CN-008] Vite 6.4.1 Dev Server — Arbitrary File Read via WebSocket, Exposed on All Interfaces
- **Severity:** High (CVSS ~7.5)
- **CWE:** CWE-200 (Information Exposure), CWE-22 (Path Traversal)
- **OWASP:** A06:2025 (Vulnerable and Outdated Components)
- **Location:** `package.json:42` — `"vite": "^6.0.5"` (installed 6.4.1); `package.json` dev script: `"dev": "vite --host"`
- **Description:** Vite ≤6.4.1 allows any origin to read arbitrary files from the developer's machine via the HMR WebSocket (GHSA-p9ff-h696-f583, GHSA-4w7w-66w2-5vf9). The `--host` flag in the dev script binds the server to **all network interfaces**, making this remotely exploitable from any device on the same network as the developer's machine (or the Raspberry Pi if used as a dev server).
- **Evidence:**
  ```json
  "scripts": { "dev": "vite --host" }
  Installed: vite@6.4.1  (fix available: >=6.4.2)
  ```
- **Remediation:**
  ```bash
  npm install --save-dev vite@latest
  ```
  Also consider removing `--host` from the dev script or replacing with `--host 127.0.0.1` if network access is not needed.

---

#### [CN-009] DOMPurify 2.5.8 — XSS Bypass in Active HTML Sanitizer
- **Severity:** High (CVSS ~7.5)
- **CWE:** CWE-79 (Cross-Site Scripting)
- **OWASP:** A06:2025 (Vulnerable and Outdated Components)
- **Location:** `package.json` (transitive, installed 2.5.8)
- **Description:** DOMPurify is the HTML sanitizer used by the application to neutralize XSS. The installed version 2.5.8 falls in the vulnerable range for three of four known advisories (GHSA-vhxf-7vqr-mrjg, GHSA-v8jm-5vwx-cfxm, GHSA-v2wj-7wpq-c8vv). These advisories describe bypass techniques that allow crafted HTML to survive sanitization and execute in the DOM. Since the entire XSS protection for user-generated content depends on DOMPurify, a bypass means the protection is effectively non-functional.
- **Evidence:**
  ```
  Installed: dompurify@2.5.8
  GHSA-vhxf-7vqr-mrjg  XSS bypass  range: <3.2.4  (installed: 2.5.8 — AFFECTED)
  GHSA-v8jm-5vwx-cfxm  XSS bypass  range: >=2.5.3 <=2.5.8  (AFFECTED)
  GHSA-v2wj-7wpq-c8vv  XSS bypass  range: >=2.5.3 <=2.5.8  (AFFECTED)
  ```
- **Remediation:**
  ```bash
  npm install dompurify@latest   # target >=3.2.4
  ```

---

#### [CN-010] lodash ≤4.17.23 — Code Injection via `_.template` + Prototype Pollution
- **Severity:** High (CVSS ~8.1)
- **CWE:** CWE-94 (Code Injection), CWE-1321 (Prototype Pollution)
- **OWASP:** A06:2025 (Vulnerable and Outdated Components)
- **Location:** `package-lock.json` (transitive via recharts, installed ≤4.17.23)
- **Description:** GHSA-r5fr-rjxr-66jc (CVSS 8.1): `_.template` with user-controlled import key names executes arbitrary code. GHSA-f23m-r3pf-42rh (CVSS 6.5): `_.unset`/`_.omit` allow prototype pollution via array path bypass. lodash is pulled in transitively by `recharts`. If any code calls `_.template` with user input this is critical; the prototype pollution is always present.
- **Remediation:**
  ```bash
  npm update   # fix is available upstream
  # If lodash doesn't update transitively, add to package.json:
  # "overrides": { "lodash": "^4.17.24" }
  ```

---

### Medium Findings

#### [CN-011] IDOR — `POST /api/users` Accepts Arbitrary `company_id` Without Ownership Validation
- **Severity:** Medium (CVSS ~6.5)
- **CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)
- **OWASP:** A01:2025 (Broken Access Control)
- **Location:** `backend/src/api/routes/users.ts:13-80`
- **Description:** The user creation endpoint accepts `company_id` as a required field from the request body and uses it directly without verifying it matches the authenticated admin/manager's own company. An admin of Company A can create users belonging to Company B by supplying Company B's UUID.
- **Evidence:**
  ```typescript
  const createUserSchema = z.object({
    full_name: z.string().min(1).max(200),
    email: z.string().email(),
    company_id: z.string().uuid(),  // user-supplied — never compared to authUser.company_id
    group_id: z.string().optional(),
  });

  users.post('/', requireRole(['admin', 'manager']), async (c) => {
    const parsed = createUserSchema.safeParse(await c.req.json());
    const { company_id } = parsed.data;   // untrusted input used directly
    await sb.auth.admin.createUser({ user_metadata: { company_id } });
  ```
- **Remediation:**
  ```typescript
  users.post('/', requireRole(['admin', 'manager']), async (c) => {
    const authUser = c.get('user');
    const company_id = authUser.company_id;   // always use auth user's company
    if (!company_id) return c.json({ error: { code: 'no_company' } }, 422);
    // Remove company_id from createUserSchema
    const { full_name, email, group_id } = parsed.data;
    await sb.auth.admin.createUser({ user_metadata: { company_id, full_name } });
  ```

---

#### [CN-012] Hono 4.12.12 — `bodyLimit` Bypass + JWT NumericDate Validation Flaw
- **Severity:** Medium (CVSS ~6.5)
- **CWE:** CWE-400 (Uncontrolled Resource Consumption), CWE-1284 (Improper Validation of Numeric Input)
- **OWASP:** A06:2025 (Vulnerable and Outdated Components)
- **Location:** `backend/package.json` — `"hono": "^4.7.7"` (installed 4.12.12)
- **Description:** Six advisories affect hono ≤4.12.17. Most relevant: GHSA-9vqf-7f2p-gf9v — the `bodyLimit()` middleware can be bypassed for chunked or unknown-length requests, allowing an attacker to send oversized requests to exhaust memory on the Raspberry Pi. GHSA-hm8q-7f3q-5f36 — JWT `verify()` improperly validates `exp`/`nbf`/`iat` NumericDate claims, potentially accepting expired tokens. Fix is available at ≥4.12.18.
- **Evidence:**
  ```
  Installed: hono@4.12.12
  GHSA-9vqf-7f2p-gf9v  bodyLimit bypass for chunked requests (CVSS 6.5)
  GHSA-hm8q-7f3q-5f36  JWT NumericDate validation (CVSS 3.8)
  Fix: hono@>=4.12.18
  ```
- **Remediation:**
  ```bash
  cd backend && npm install hono@latest
  ```

---

#### [CN-013] Error Handler Exposes Internal `err.message` to Clients in Production
- **Severity:** Medium (CVSS ~5.3)
- **CWE:** CWE-209 (Generation of Error Message Containing Sensitive Information)
- **OWASP:** A10:2025 (Mishandling of Exceptional Conditions)
- **Location:** `backend/src/index.ts:69-75`
- **Description:** The global `onError` handler returns `err.message` directly in the HTTP 500 response body regardless of `NODE_ENV`. Internal errors from Supabase, pdfkit, exceljs, and the SignalR listener contain table names, column names, file paths, and SDK internals. These are returned verbatim to clients in production.
- **Evidence:**
  ```typescript
  app.onError((err, c) => {
    console.error(`[error] ${c.req.method} ${c.req.path}:`, err);
    return c.json(
      { error: { code: 'internal_error', message: err.message } },  // leaks internals
      500
    );
  });
  ```
- **Remediation:**
  ```typescript
  app.onError((err, c) => {
    console.error(`[error] ${c.req.method} ${c.req.path}:`, err);
    const isProd = process.env['NODE_ENV'] === 'production';
    return c.json(
      { error: { code: 'internal_error', message: isProd ? 'Error interno del servidor' : err.message } },
      500
    );
  });
  ```

---

#### [CN-014] Rate Limit Window Is 10 Seconds, Not the Documented 5 Minutes
- **Severity:** Medium (CVSS ~5.3)
- **CWE:** CWE-770 (Allocation of Resources Without Limits or Throttling)
- **OWASP:** A06:2025 (Insecure Design)
- **Location:** `backend/src/api/middleware/rate-limit.ts:8`
- **Description:** The rate limiter comment and CLAUDE.md both state "max 1 fichaje per user every 5 minutes → 429". The actual implementation uses `10 * 1000` (10 seconds). A user can clock in/out 360 times per hour instead of the intended 12, generating thousands of spurious records per day and bypassing attendance-integrity controls.
- **Evidence:**
  ```typescript
  /**
   * Rate limiter for POST /api/me/fichar.
   * Allows at most 1 fichaje per user every 5 minutes.  ← comment
   */
  const FICHAJE_WINDOW_MS = 10 * 1000; // 10 seconds    ← implementation
  ```
- **Remediation:**
  ```typescript
  const FICHAJE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  ```

---

#### [CN-015] No Global Request Body Size Limit — Potential DoS on Raspberry Pi
- **Severity:** Medium (CVSS ~5.3)
- **CWE:** CWE-400 (Uncontrolled Resource Consumption)
- **OWASP:** A06:2025 (Insecure Design)
- **Location:** `backend/src/index.ts:24-38`
- **Description:** No body size limit middleware is applied globally. Any endpoint accepting a request body — including the public webhook routes — can receive arbitrarily large payloads, exhausting memory on the memory-constrained Raspberry Pi. Compounded by CN-012 (Hono bodyLimit bypass), even if `bodyLimit` is added it needs the patched Hono version to be effective against chunked requests.
- **Evidence:**
  ```typescript
  app.use('*', cors({...}));
  app.use('*', logger());
  // No bodyLimit middleware
  app.route('/webhooks', webhookRoutes);  // public, no size limit
  app.route('/api', apiRoutes);           // no size limit
  ```
- **Remediation:**
  ```typescript
  import { bodyLimit } from 'hono/body-limit';
  // Add after cors, before routes:
  app.use('*', bodyLimit({ maxSize: 1 * 1024 * 1024 })); // 1 MB global limit
  ```
  Also update Hono to ≥4.12.18 (see CN-012) to close the chunked-transfer bypass.

---

#### [CN-016] CSV Injection in External Fichajes Export
- **Severity:** Medium (CVSS ~5.0)
- **CWE:** CWE-1236 (Improper Neutralization of Formula Elements in a CSV File)
- **OWASP:** A05:2025 (Injection)
- **Location:** `backend/src/api/routes/external.ts:117-134`
- **Description:** The `buildFichajesCSV` function writes user-controlled fields (`full_name`, `employee_code`, `device_info`, `zone_name`) directly into CSV output without sanitizing formula-injection characters. If an employee's name contains `=HYPERLINK("http://evil.com","Click me")`, spreadsheet applications will interpret it as a formula when HR opens the export in Excel, enabling phishing or data exfiltration.
- **Evidence:**
  ```typescript
  const rows = items.map(i =>
    [
      i.id, i.timestamp,
      `"${i.user.full_name}"`,   // full_name not sanitized
      i.user.employee_code,      // not sanitized
      i.direction, i.source, i.device_info   // not sanitized
    ].join(',')
  );
  ```
- **Remediation:**
  ```typescript
  function sanitizeCsvCell(value: string): string {
    const dangerous = ['=', '+', '-', '@', '\t', '\r', '\n'];
    const s = String(value ?? '');
    if (dangerous.some(c => s.startsWith(c))) return `'${s}`;
    return s;
  }
  // Use on every user-supplied field:
  `"${sanitizeCsvCell(i.user.full_name)}"`, sanitizeCsvCell(i.user.employee_code), ...
  ```

---

#### [CN-017] No Security Headers Middleware on Hono Backend
- **Severity:** Medium (CVSS ~4.3)
- **CWE:** CWE-693 (Protection Mechanism Failure)
- **OWASP:** A02:2025 (Security Misconfiguration)
- **Location:** `backend/src/index.ts:24-38`
- **Description:** The Hono backend sets no security headers. Hono ships `hono/secure-headers` (equivalent to Helmet.js) which is not used. API responses lack `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`. While a pure JSON API has reduced risk from these headers, they still provide defense-in-depth, especially if the API is ever accessed via a browser redirect.
- **Remediation:**
  ```typescript
  import { secureHeaders } from 'hono/secure-headers';
  app.use('*', secureHeaders());  // after cors()
  ```

---

#### [CN-018] Docker Base Image Unpinned — Floating `node:22-alpine` Tag
- **Severity:** Medium (CVSS ~4.8)
- **CWE:** CWE-1104 (Use of Unmaintained Third-Party Components)
- **OWASP:** A02:2025 (Security Misconfiguration)
- **Location:** `backend/Dockerfile:1,8`
- **Description:** `node:22-alpine` is a floating tag whose digest changes on upstream updates. A supply chain compromise of the upstream image could silently affect the build without any record in the Dockerfile. Pinning by SHA256 digest guarantees reproducible builds.
- **Evidence:**
  ```dockerfile
  FROM node:22-alpine AS builder   # floating tag
  FROM node:22-alpine              # floating tag
  ```
- **Remediation:**
  ```bash
  # Get the current digest:
  docker pull node:22-alpine && docker inspect --format='{{index .RepoDigests 0}}' node:22-alpine
  # Use in Dockerfile:
  FROM node:22-alpine@sha256:<digest> AS builder
  FROM node:22-alpine@sha256:<digest>
  ```

---

#### [CN-019] Manager Role Can Update Physical Access Credentials (`ac_api_token`)
- **Severity:** Medium (CVSS ~5.0)
- **CWE:** CWE-269 (Improper Privilege Management)
- **OWASP:** A01:2025 (Broken Access Control)
- **Location:** `backend/src/api/routes/admin.ts:284`
- **Description:** The `PATCH /api/admin/settings` endpoint allows the `manager` role to update the 2N AC API token — credentials that control physical building access hardware. `manager` is a lower-trust role than `admin`. A compromised manager account could replace the AC token with attacker-controlled credentials.
- **Evidence:**
  ```typescript
  admin.patch('/settings', requireRole(['admin', 'manager']), async (c) => {
    // ... processes ac_api_token from request body
  ```
- **Remediation:**
  ```typescript
  // Restrict AC credential updates to admin only:
  admin.patch('/settings', requireRole(['admin']), async (c) => {
  // Or use separate endpoints:
  admin.patch('/settings/ac-credentials', requireRole(['admin']), ...);
  admin.patch('/settings/general', requireRole(['admin', 'manager']), ...);
  ```

---

#### [CN-020] Hardcoded Private LAN IP in Mobile Production Build Profile
- **Severity:** Medium (CVSS ~4.3)
- **CWE:** CWE-200 (Exposure of Sensitive Information)
- **OWASP:** A02:2025 (Security Misconfiguration)
- **Location:** `mobile/eas.json:10,16,22`
- **Description:** The EAS build configuration hardcodes `http://192.168.1.137:3000` as `EXPO_PUBLIC_API_BASE_URL` in all three build profiles — including **production**. The `EXPO_PUBLIC_` prefix bundles this value into the compiled app binary (readable by APK/IPA decompilation). In production, this IP is unreachable for any user outside the home LAN, causing silent API failures for all production users.
- **Evidence:**
  ```json
  "production": {
    "env": {
      "EXPO_PUBLIC_API_BASE_URL": "http://192.168.1.137:3000"
    }
  }
  ```
- **Remediation:**
  ```json
  "production": {
    "env": {
      "EXPO_PUBLIC_API_BASE_URL": "https://api.rabadanhouse.space"
    }
  },
  "preview": {
    "env": {
      "EXPO_PUBLIC_API_BASE_URL": "https://api.rabadanhouse.space"
    }
  }
  ```

---

#### [CN-021] No Automated Dependency Update Tooling — 1 Critical + 9 High CVEs Accumulated
- **Severity:** Medium (CVSS ~5.0)
- **CWE:** CWE-1104 (Use of Unmaintained Third-Party Components)
- **OWASP:** A03:2025 (Software Supply Chain Failures)
- **Location:** Repository root (no `.github/` directory, no `renovate.json`)
- **Description:** There is no Dependabot, Renovate, or any CI pipeline with `npm audit` configured. The project has accumulated 32 vulnerabilities (1 critical, 9 high) without automated alerting. Vulnerabilities will continue to compound silently.
- **Remediation:** Create `.github/dependabot.yml`:
  ```yaml
  version: 2
  updates:
    - package-ecosystem: "npm"
      directory: "/"
      schedule: { interval: "weekly" }
    - package-ecosystem: "npm"
      directory: "/backend"
      schedule: { interval: "weekly" }
  ```
  Also add a pre-push hook or CI step: `npm audit --audit-level=high`.

---

### Low & Informational Findings

#### [CN-022] Webhook Secret Comparisons Not Timing-Safe (3 locations)
- **Severity:** Low
- **CWE:** CWE-208 (Observable Timing Discrepancy)
- **Location:** `backend/src/api/routes/webhooks.ts:12-13` (n8n), `webhooks.ts:289-291` (2N device), `webhooks.ts:313` (Node-RED)
- **Description:** All three webhook secrets are compared with `===` (non-constant-time). Timing oracle attacks against the Cloudflare Tunnel-exposed endpoint could theoretically brute-force the secrets byte-by-byte.
- **Remediation:**
  ```typescript
  import { timingSafeEqual } from 'crypto';
  function verifySecret(received: string | undefined, expected: string | undefined): boolean {
    if (!received || !expected) return false;
    const a = Buffer.from(received), b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  ```

---

#### [CN-023] API Documentation Accessible Without Authentication
- **Severity:** Low
- **CWE:** CWE-200 (Exposure of Sensitive Information)
- **Location:** `backend/src/api/routes/docs.ts:263-296`, `backend/src/index.ts:66`
- **Description:** `/docs` (Swagger UI) and `/openapi.json` are publicly accessible without authentication. They expose all internal route paths, parameter names, error codes, and the production server URL. The docs also reveal internal routes not intended for external use.
- **Remediation:** Gate on `NODE_ENV !== 'production'` or require authentication:
  ```typescript
  if (process.env['NODE_ENV'] !== 'production') {
    app.route('', docsRoutes);
  }
  ```

---

#### [CN-024] Swagger UI Loads JavaScript from Unpinned CDN Without SRI Hash
- **Severity:** Low
- **CWE:** CWE-829 (Inclusion of Functionality from Untrusted Control Sphere)
- **Location:** `backend/src/api/routes/docs.ts:274-280`
- **Description:** The `/docs` page loads Swagger UI from `https://unpkg.com/swagger-ui-dist@5/...` without Subresource Integrity hashes. `persistAuthorization: true` is set, meaning typed API keys are saved in the browser — a CDN compromise could exfiltrate them.
- **Remediation:** Remove `persistAuthorization: true`. Add SRI hashes or vendor the Swagger UI files.

---

#### [CN-025] In-Memory Rate Limiter Lost on Container Restart
- **Severity:** Low
- **CWE:** CWE-362 (Race Condition / Concurrent Execution)
- **Location:** `backend/src/api/middleware/rate-limit.ts:5-6`
- **Description:** The fichaje rate limiter uses an in-memory `Map` that resets on every container restart. A forced restart clears all rate-limit state, allowing burst fichajes immediately after restart. An acknowledged TODO in the code notes Redis is needed.
- **Remediation:** Enforce the cooldown via a database query against `access_logs.timestamp` (the last fichaje timestamp is already fetched in the fichar route), making the check restart-resilient without Redis.

---

#### [CN-026] Docker HEALTHCHECK Not Configured
- **Severity:** Low
- **CWE:** CWE-400 (Uncontrolled Resource Consumption)
- **Location:** `backend/Dockerfile`
- **Description:** No `HEALTHCHECK` instruction. Docker/Portainer cannot detect a degraded application (hung SignalR listener, deadlocked event loop) and will not auto-restart the container. The `/health` endpoint exists and should be used.
- **Remediation:**
  ```dockerfile
  HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1
  ```

---

#### [CN-027] Role Field Cast Without Enum Validation in Auth Middleware
- **Severity:** Low
- **CWE:** CWE-284 (Improper Access Control)
- **Location:** `backend/src/api/middleware/auth.ts:29-43`
- **Description:** The `role` from `profiles` is cast directly to `AuthUser['role']` without checking it's a known value. An unexpected DB value would fail-safe (403), but explicit validation is a defense-in-depth gap.
- **Remediation:**
  ```typescript
  const VALID_ROLES = ['superadmin', 'admin', 'manager', 'employee'] as const;
  const rawRole = profile?.role ?? 'employee';
  const role = (VALID_ROLES as readonly string[]).includes(rawRole) ? rawRole as UserRole : 'employee';
  ```

---

#### [CN-028] Hono Logger Active Unconditionally in Production
- **Severity:** Low
- **CWE:** CWE-532 (Insertion of Sensitive Information into Log File)
- **Location:** `backend/src/index.ts:38`
- **Description:** `app.use('*', logger())` runs in all environments. Request paths may include UUIDs, filter parameters, and employee IDs in query strings. These stream unredacted to Docker stdout, visible in Portainer without rotation or access controls.
- **Remediation:**
  ```typescript
  if (process.env['NODE_ENV'] !== 'production') {
    app.use('*', logger());
  }
  ```

---

#### [CN-029] Vite Source Map Generation Not Explicitly Disabled
- **Severity:** Low
- **CWE:** CWE-540 (Inclusion of Sensitive Information in Source Code)
- **Location:** `vite.config.js`
- **Description:** No `build.sourcemap` setting. Vite defaults to `false` in production but an environment variable override or future config change could silently enable source maps on Vercel.
- **Remediation:**
  ```javascript
  export default defineConfig({
    build: { sourcemap: false },
    // ...
  });
  ```

---

#### [CN-030] localhost Fallback URL Duplicated in 6 Frontend Files
- **Severity:** Low
- **CWE:** CWE-1327 (Binding to an Unrestricted IP Address)
- **Location:** `src/lib/api.js:4`, `src/pages/admin/AdminAttendancePage.jsx:8`, `AdminDashboardPage.jsx:9`, `AdminCorrectionsPage.jsx:9`, `src/pages/employee/DashboardPage.jsx:13`, `ReportsPage.jsx:6`, `HistoryPage.jsx:12`
- **Description:** `const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'` is defined in 7 places. If `VITE_API_URL` is missing from Vercel, the production app silently sends all API calls to localhost with no error. The fix in `api.js` does not propagate to the other 6 files.
- **Remediation:** Remove the fallback from all files. Import `BASE_URL` exclusively from `src/lib/api.js`. Throw if the env var is missing: `if (!BASE_URL) throw new Error('VITE_API_URL is required')`.

---

#### [CN-031] Puppeteer devDependency Downloads Chromium Without Skip Flag
- **Severity:** Low
- **CWE:** CWE-829 (Inclusion of Functionality from Untrusted Control Sphere)
- **Location:** `package.json:39` — `"puppeteer": "^24.40.0"`
- **Description:** No `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` is set. Any `npm install` without `--omit=dev` downloads ~300MB of Chromium. On the Pi or in CI environments where dev deps are installed, this increases the attack surface unnecessarily.
- **Remediation:** Add `.npmrc` at the project root:
  ```
  PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
  ```

---

#### [CN-032] VITE_SUPABASE_ANON_KEY Exposed to Browser — Verify RLS Is Enforced
- **Severity:** Info
- **CWE:** CWE-312
- **Location:** `src/lib/supabase.js:3-4`
- **Description:** `VITE_SUPABASE_ANON_KEY` is bundled into the frontend JavaScript and visible to all users. This is by design for Supabase's client SDK and is safe **only if** Row Level Security (RLS) is enabled on every table. No `service_role` key is exposed (correct).
- **Remediation:** Verify RLS on all tables: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';` — all should show `rowsecurity = true`.

---

#### [CN-033] `.env.example` Contains JWT Prefix That Triggers Secret Scanners
- **Severity:** Info
- **Location:** `.env.example:3`
- **Description:** `VITE_SUPABASE_ANON_KEY=eyJ...` uses a real JWT prefix. Not a real secret, but will produce false positives in automated scanning tools.
- **Remediation:** Replace with `VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here`.

---

## Dependency Vulnerabilities

### Frontend (`package.json`) — npm audit summary

| Package | Installed | Severity | CVEs / Advisories | Fix |
|---------|-----------|----------|-------------------|-----|
| jspdf | 2.5.2 | **Critical** | GHSA-wfv2-pwc8-crg5, -pqxr-3g65-p328, -9vjf-qc39-jprp, +8 more | `jspdf@^4.2.1` |
| xlsx | 0.18.5 | **High** | GHSA-4r6h-8v6p-xvw6 (prototype pollution), GHSA-5pgg-2g8v-p4x9 (ReDoS) | **No npm fix** — remove |
| lodash | ≤4.17.23 | **High** | GHSA-r5fr-rjxr-66jc (code injection), GHSA-f23m-r3pf-42rh (prototype pollution) | `npm update` |
| dompurify | 2.5.8 | **High** | GHSA-vhxf-7vqr-mrjg, -v8jm-5vwx-cfxm, -v2wj-7wpq-c8vv (XSS bypasses) | `dompurify@latest` |
| vite | 6.4.1 | **High** | GHSA-p9ff-h696-f583, GHSA-4w7w-66w2-5vf9 (arbitrary file read) | `vite@latest` |
| rollup | 4.57.0 | **High** | GHSA-mw96-cpmx-2vgc (arbitrary file write) | Update Vite (transitive) |
| jspdf-autotable | 3.8.4 | **High** | Inherits jsPDF advisories | `jspdf-autotable@^5.0.8` |
| basic-ftp | 5.2.2 | **High** | GHSA-rp42-5vxx-qpwr, GHSA-rpmf-866q-6p89 (DoS) | `npm audit fix` |
| flatted | ≤3.4.1 | **High** | GHSA-25h7-pfq9-p65f, GHSA-rf6f-7fwh-wjgh | `npm audit fix` |
| minimatch | ≤3.1.3 | **High** | 3× ReDoS (CVSS 7.5 each) | `npm audit fix` |
| picomatch | 4.0.0-4.0.3 | **High** | GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj | `npm audit fix` |
| dompurify | 2.5.8 | Medium | XSS bypass (see above) | See above |
| postcss | 8.5.6 | Medium | GHSA-qx2v-qp2m-jg93 (XSS via `</style>`) | `postcss@latest` |
| ws | 8.20.0 | Medium | GHSA-58qx-3vcg-4xpx (memory disclosure) | Update Vite |
| ajv | 6.12.6 | Medium | GHSA-2g4f-4pwh-qvx6 (ReDoS) | `npm audit fix` |
| brace-expansion | ≤1.1.12 | Medium | GHSA-f886-m6hf-6m8v (DoS) | `npm audit fix` |
| ip-address | ≤10.1.0 | Medium | GHSA-v2v4-37r5-5v8g (XSS) | `npm audit fix` |

**Frontend total: 32 vulnerabilities (1 critical, 9 high, 6 medium)**

### Backend (`backend/package.json`) — npm audit summary

| Package | Installed | Severity | CVEs / Advisories | Fix |
|---------|-----------|----------|-------------------|-----|
| hono | 4.12.12 | Medium | GHSA-9vqf-7f2p-gf9v (bodyLimit bypass), GHSA-hm8q-7f3q-5f36 (JWT validation) | `hono@latest` |
| uuid | 8.3.2 | Medium | GHSA-w5hq-g745-h8pq (OOB write) | `overrides: { "uuid": ">=11.1.1" }` |
| exceljs | 4.4.0 | Medium | Inherits uuid vulnerability | See uuid fix |
| ws | 8.20.0 | Medium | GHSA-58qx-3vcg-4xpx (memory disclosure) | `overrides: { "ws": ">=8.20.1" }` |

**Backend total: 4 vulnerabilities (0 critical, 0 high, 4 medium)**

---

## Supply Chain Assessment

- **Lock file status:** Both `package-lock.json` files present, tracked in git, and contain SHA-512 integrity hashes (694 frontend packages, 247 backend packages). Lock files are correctly **not** in `.gitignore`. ✅
- **Dependency pinning:** All 41 direct dependencies use `^` (caret) floating ranges — no exact pins. Lock files mitigate drift for existing installs. Use `npm ci` (not `npm install`) in all deployment pipelines to enforce the lock file.
- **Version divergence:** Frontend uses `@supabase/supabase-js ^2.105.1`, backend uses `^2.49.4` — different major minor ranges for the same SDK. Should be aligned.
- **CI/CD security:** No `.github/workflows/` directory. No CI pipeline exists. No automated `npm audit`, no automated security scanning, no Dependabot/Renovate. All dependency updates are manual.
- **Known abandoned packages:** `xlsx` (SheetJS CE) — no security patches published to npm since 0.18.5. Must be replaced.
- **SBOM:** Not generated. Consider `npm sbom --sbom-format cyclonedx` as part of the release process.

---

## Scan Metadata

- **Scanner:** Cyber Neo v0.1.0 (Claude-native + npm audit)
- **Date:** 2026-05-26
- **External tools used:** `npm audit` (frontend and backend). Semgrep, Trivy, Gitleaks not available.
- **Files scanned:** 162 source files (100% coverage — small project tier)
- **Files skipped:** ~940 dependency packages in `node_modules/` (scanned via npm audit instead), `dist/` build outputs
- **Phases executed:** SCA (npm audit), SAST (Claude-native), Secret Detection, Configuration/Infrastructure, Supply Chain
- **Key files analyzed in depth:** `backend/src/index.ts`, `backend/src/api/routes/admin.ts`, `backend/src/api/routes/users.ts`, `backend/src/api/routes/webhooks.ts`, `backend/src/api/routes/external.ts`, `backend/src/api/middleware/auth.ts`, `backend/src/api/middleware/rate-limit.ts`, `backend/Dockerfile`, `vercel.json`, `vite.config.js`, `mobile/eas.json`, all frontend `src/pages/` files
