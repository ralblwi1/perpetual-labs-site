# Perpetual Labs — website + gated research (v4)

The live perpetual-labs.ai site: the public marketing page plus **server-side
password-gated** research. Deployed on Vercel (Edge Middleware).

**v4 (2026-08-05):** `index.html` compiled from the client's Claude-artifact
export `build-tools/source-v4.dc.html` via `build-tools/compile_site.py`
(`python3 build-tools/compile_site.py build-tools/source-v4.dc.html index.html`).
For a future v5 export, rerun the compiler on the new `.dc.html` — it resolves
`sc-if` props, converts `style-hover`/`style-focus` to real CSS, adds SEO head,
and appends the mobile-header fix. Everything else (gate, api, data.html,
perpetual-os.html) is carried over byte-identical from `~/perpetual-site-v3`.

> ⚠️ The newsletter content in this repository is protected on the deployed
> site, but remains visible wherever this Git repository is public. QuantBench
> content is therefore kept out of this repository and stored in private Vercel
> Blob storage.

## Layout
- `index.html`, `assets/` — public marketing page (nav has a **newsletter** tab).
- `gate.html` — the minimal "under construction" + password page (public).
- `newsletter.html`, `newsletter/` — the gated content (landing, 17 analyses, 3D brain, PDFs, data). **Served only with a valid session.**
- `quantbench.html` — a gated catalog shell. Its private catalog, paper, and evaluation samples are loaded only through `api/quantbench.js`.
- `middleware.js` — Edge Middleware: gates the newsletter, QuantBench catalog, and general Data Room; no valid `pl_session` cookie redirects to `gate.html`.
- `api/unlock.js` — checks the password (env var) and sets an HMAC-signed, HttpOnly, 24h session cookie. Wrong guesses throttled.
- `api/lock.js` — clears the session (the in-page "lock" link).
- `api/quantbench.js` — verifies the signed session again before streaming any object from the private `perpetual-labs-quantbench` Blob store.
- `vercel.json` — headers (noindex + no-store on the gated paths).

## How the gate works
The shared general-data password lives only in the `DATA_PASSWORD` env var
(never shipped to the browser). `NEWSLETTER_PASSWORD` remains a legacy fallback.
The session cookie is an HMAC token signed with `SESSION_SECRET`, so it can't be
forged. Rotating `SESSION_SECRET` invalidates every existing session. Company-
specific pages must use their own password and session cookie.

## Deploy
1. Import into Vercel (or `vercel --prod`).
2. Set two **Environment Variables** (Project → Settings → Environment Variables, Production) — see `.env.example`:
   - `DATA_PASSWORD` — the shared general Research and dataset password.
   - `SESSION_SECRET` — a long random string (`openssl rand -hex 32`).
3. Connect the private `perpetual-labs-quantbench` Blob store so Vercel adds `BLOB_READ_WRITE_TOKEN`.
4. Deploy. `/` is public; the newsletter, QuantBench, and Data Room pages share the general data password and unlock for 24h.

To change the shared password: update `DATA_PASSWORD` and redeploy. To boot all
sessions: rotate `SESSION_SECRET` and redeploy.
