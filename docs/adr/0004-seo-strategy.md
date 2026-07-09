# ADR-0004: SEO strategy for the public map (SPA)

**Date:** 2026-07-09
**Status:** Accepted (phase 1 shipped; phase 2 proposed)

## Context

`kasrut-map` is a client-rendered Vite SPA. Prod served an empty `<div id="root">`
shell, a one-URL `sitemap.xml`, and no `og:image` — so search engines had almost
nothing to index and links shared into the community's WhatsApp/Telegram groups
(the main growth channel) rendered with no preview. Hundreds of establishments
now have shareable `/r/:id` URLs (see the deep-link work) but no crawlable content.

## Decision

**Phase 1 (shipped) — discovery + social previews, no SSR:**

- **Dynamic sitemap from the DB.** `GET /api/map/sitemap.xml` lists `/` and every
  visible establishment `/r/:id` (same visibility rule as the map — no removed or
  expired places), cached 1 h. It is reachable on the map host via the existing
  `/api` proxy, so no nginx change was needed. `robots.txt` `Allow`s that one path
  under an otherwise-`Disallow`ed `/api/` and declares the sitemap.
- **Head/OG/JSON-LD.** `index.html` gains `og:image` (+ `twitter:card=summary_large_image`),
  `og:locale:alternate` for he/en, and a JSON-LD `@graph` (Organization + WebSite +
  WebApplication). A branded 1200×630 `og-image.svg` ships in `public/`.

## Consequences

**Positive:** every establishment URL is now discoverable; the site describes
itself to Google via structured data; shared links can render a branded preview.

**Negative / follow-ups:**

- **Raster og-image.** `og-image.svg` is best-effort — WhatsApp/Facebook mostly
  require PNG/JPG. Export `og-image.svg` → `og-image.png` (1200×630) and point the
  `og:image`/`twitter:image` tags at the PNG. (No raster tooling was available in
  the dev env; this is a trivial one-off with any converter or `sharp`.)
- **apple-touch-icon** still references an SVG (iOS ignores it) — add a 180×180 PNG.

**Phase 2 (proposed) — per-place indexable pages.** Every `/r/:id` currently serves
the same generic shell, so Google sees identical title/description for all places.
To win queries like "кошерный ресторан Тверия" each place needs its own
`<title>`/description/canonical/`og:*` and JSON-LD `FoodEstablishment`. Options,
cheapest first:

1. **Bot-facing prerender at the edge.** An API route renders a minimal HTML doc
   (per-place meta + JSON-LD + a link to the SPA) and nginx routes crawler
   user-agents for `/r/:id` to it; humans still get the SPA. Small, no framework
   change; needs one nginx `map $http_user_agent` block.
2. **Static prerender at deploy.** A post-build script fetches the establishment
   list and writes `/r/<id>.html` files with per-place meta into the served root.
   Needs DB access in the deploy step and a nginx `try_files` tweak.
3. **Migrate to an SSR framework** (Next.js / vite-ssr). Cleanest long-term, largest
   change.

Recommendation: option 1 — highest SEO value per unit of risk, reuses the existing
`getRestaurant` data path.
