# SplitIt

A Splitwise-style expense splitter in React + Supabase, with **real multiuser sync** and **realtime group chat**. Everything stays on free tiers.

Features: email/password auth · groups with shareable invite codes · expenses split four ways (equal / exact / percent / shares, leftover cents to the payer) · per-member balances · simplify-debts suggested payments · settle up · realtime chat per group · live sync across devices · dark mode.

## Setup (one time, ~5 minutes)

You need a free [Supabase](https://supabase.com) account. No credit card.

1. **Create a Supabase project.** supabase.com → New project. Wait for it to finish provisioning.
2. **Run the schema.** In the Supabase dashboard open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. **Add your keys.** In the project copy this folder's `.env.example` to `.env` and fill in:
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — from **Project Settings → API**.
4. **Run it.**
   ```
   npm install
   npm run dev
   ```
   Open the printed `http://localhost:5173`. Sign up, create a group, and share its invite code with a friend (they sign up and "Join by code"). Open it on two devices to see live sync and chat.

Check the money math anytime with `npm test`.

## Email confirmation (so you can log in immediately in dev)

Supabase sends a confirmation email on sign-up by default. For testing, turn it off:
**Authentication → Providers → Email → uncheck "Confirm email"**. Turn it back on (and add an SMTP provider) before inviting lots of people — the built-in email sender is rate-limited.

## Deploy free (optional)

Push to GitHub, connect the repo in **Cloudflare Pages** (build `npm run build`, output `dist`), and add the two `VITE_…` env vars there. You get a free `https://…pages.dev` URL you can add to your phone's home screen.

## What's intentionally left out (add later, one feature at a time)

Receipt photos/OCR, recurring expenses, multi-currency conversion, charts, CSV import/export, push notifications, offline queue, PWA install prompt. The schema and UI are structured so these slot in without a rewrite.

## Note

`splitit.html` in this folder is a separate, standalone single-file version that works offline with no backend (single device only). This React project is the real multiuser one.
