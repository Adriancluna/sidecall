# UX reference: Render dashboard (dark)

Reference for the Oct 24-25 dashboard redesign (page structure). Measured Oct 25, 2026 at 1440x900 from the signed-in dashboard (Overview and Account settings) through computed styles. Values only: no logo, icons, copy or code.

## What Render does that Sidecall needs
Render is the answer to the critique's P1 ("sidebar clicks don't change the visible page"): every sidebar item is a **page**, and every page opens with its own large title.

- **Page title:** `h1` 32px/36px, weight 500, tracking -0.32px, top-left of the content column (x=342 at 1440, ~48px below the 56px top bar). A single page action sits on the same line, right-aligned ("Invite your team").
- **Section headings inside a page:** 20px/28px, weight 600, each opening its own bordered section card.
- **"On this page" rail:** long pages (Account settings, 9 sections) get a right-hand list of section links, 14px, starting level with the first section. The left sidebar picks the page; the right rail jumps within it.
- **Form rows:** label left (14px/600), control right (~280px wide), "Edit" action under the control, right-aligned.
- **Empty state:** one card (bg `#141414`, padding 64px 80px 80px), 20px/600 title, one sentence, then a 2x2 grid of action tiles (icon, title with arrow, one-line description).

## Shell
- Top bar 56px, bg `#0d0d0d`, bottom border: workspace switcher left, breadcrumb, then Search with `⌘K` hint, New, Upgrade, help, avatar on the right. Top-bar buttons are full-height (55px) text buttons at 13px.
- Sidebar ~290px: nav items 16px/24px (larger than Vercel's 14px), padding 6px 10px, icon + label; grouped under small mono labels (13px, uppercase, +0.65px tracking) such as Integrations, Networking, Workspace. Footer links: Changelog, Status, Collapse.
- Corners are square (radius 0) on cards and buttons; separation comes from 1px borders on near-black.
- Accent: purple for the active nav item and links.

## Mapping to Sidecall (with the Vercel look kept)
Keep Vercel's tokens (Geist, 6px radius, blue focus/link, inverted primary). Take Render's structure:
1. Each sidebar item is a page with a 32px/500 page title (or 24px Vercel h1 if 32 feels loud), one optional action on the right.
2. The $480K hero (company) and the portfolio band (firm) live on the first page only ("Held payments" / "Overview"), so other pages start at their own title.
3. In-page section headings at 20/600 ("What each company was told", "On the record").
4. Proof and Response safety are long: give them the right-hand "on this page" rail.
5. Sidebar groups for the company view: "Today" (Incident, Held payments, Bills), "Records" (Timeline, Controls log, Ledger), "Settings" (Response playbook, Slack & alerts out). Group labels in sentence case, not uppercase (team brand rule).
