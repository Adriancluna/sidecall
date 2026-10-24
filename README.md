# Sidecall

Portfolio blast radius for PE-owned companies (Cal Hacks 13.0).
Read `CLAUDE.md` for what we're building and who owns what, and `CONTRACT.md` for data shapes.

## Setup

```
npm install
npx convex dev   # first run: log in, choose the existing "sidecall" project; you get your own dev database
npm run dev      # Convex + Vite together
```

Ask Adrian for a Convex team invite if `npx convex dev` doesn't show the sidecall project.

## Deploy (Vercel + Convex production)

`vercel.json` makes every Vercel build deploy the Convex functions to production first, then build the site against it.

Vercel project → Settings → Environment Variables (Production):

| Name | Value |
|---|---|
| `CONVEX_DEPLOY_KEY` | Convex dashboard → sidecall → Production → Settings → Generate production deploy key |
| `VITE_CONVEX_SITE_URL` | Optional. The Fire incident button derives it from `VITE_CONVEX_URL` (`.convex.cloud` → `.convex.site`). |

`VITE_CONVEX_URL` is set automatically by `convex deploy` during the build.

After the first deploy, once:

```
npx convex env set DEMO_MODE true --prod   # enables the Reset button (demo data only)
npx convex run seed:run --prod             # load the demo portfolio
```
