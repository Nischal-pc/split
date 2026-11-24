# SplitIt

A Splitwise-style expense splitter in **React + Appwrite**, with real multiuser, realtime sync and group chat. Wealthsimple-inspired design. Free tier all the way.

Features: email/password auth + forgot-password · groups (one per Appwrite Team) · invite people by email · four split types (equal / exact / percent / shares, leftover cents to the payer) · per-member balances · simplify-debts suggested payments · settle up · edit/delete expenses with dates · activity feed · per-expense comments · spending insights + CSV export · realtime chat & sync · light/dark.

## Setup (one time)

You need a free [Appwrite Cloud](https://cloud.appwrite.io) account (or a self-hosted Appwrite). No card.

1. **Create a project.** cloud.appwrite.io → Create project. Copy its **Project ID** (Project Settings).
2. **Create an API key.** Project → **Overview → API keys → Create** (or Integrations → API Keys). Give it scopes: `databases.read/write`, `collections.read/write`, `attributes.read/write`, `indexes.read/write`. Copy the key.
3. **Fill `.env`.** Copy `.env.example` to `.env` and set:
   - `VITE_APPWRITE_ENDPOINT` — `https://cloud.appwrite.io/v1` (or your self-hosted `/v1`)
   - `VITE_APPWRITE_PROJECT_ID` — from step 1
   - `APPWRITE_API_KEY` — from step 2
4. **Provision + run:**
   ```
   npm install
   npm run setup     # creates the database, collections, fields, indexes, permissions
   npm run dev
   ```
   Open the printed `http://localhost:5173`, sign up, create a group, and invite a friend by email.

5. **Add your app's web platform** so the browser SDK is allowed: Appwrite → Project → **Settings → Platforms → Add platform → Web**, hostname `localhost` (and later your deployed domain). Without this, the browser calls are blocked by CORS.

### Invites & email
Inviting someone sends an Appwrite email with a join link back to this app. On **Appwrite Cloud** email works out of the box. On **self-hosted**, configure SMTP first (Appwrite console → Messaging/SMTP), or invitees won't get the link.

## How it's structured
- Each **group = an Appwrite Team**; members are team members. Every document (expense, split, settlement, message, activity, comment) is permissioned to that team, so only group members can read/write it — no server code needed.
- `src/db.js` is the only file that talks to Appwrite. `src/App.jsx` is the UI. `src/split.js` is the money/balance engine (run `npm test`).
- `scripts/setup-appwrite.mjs` builds the whole backend; re-running it is safe (it skips things that already exist).

## Deploy free (optional)
Push to GitHub, then on **Vercel**: New Project → import the repo (it auto-detects Vite: build `npm run build`, output `dist`). Add the three `VITE_…` env vars under Project → Settings → Environment Variables (NOT the API key). After the first deploy, add your `*.vercel.app` domain under Appwrite → Settings → Platforms → Web, or every browser call is blocked by CORS. For Google sign-in, also add that domain to the Google OAuth provider's redirect settings (Appwrite → Auth → Google) and to the authorized origins/redirects in Google Cloud Console.

(Cloudflare Pages works the same way — build `npm run build`, output `dist`, add the three `VITE_…` vars, then add your `*.pages.dev` domain under Appwrite → Platforms.)

## Not yet built
Receipt photos/OCR, recurring expenses, multi-currency conversion, push notifications.
