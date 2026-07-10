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

**Phase 2 — per-place indexable pages (bot-facing prerender).** Every `/r/:id`
served the same generic shell, so Google saw identical title/description for all
places. Option 1 below (chosen) is now **half-shipped**: the API renders per-place
crawler HTML; the nginx routing is the remaining deploy step.

- **API (done):** `GET /api/map/prerender/:id` returns a minimal HTML document with
  per-place `<title>`, description, canonical, `og:*`, and JSON-LD `Restaurant`
  (address always; `geo` only when `geoAccuracy = exact`, so an approximate pin is
  never advertised to Google). It reuses the cached `getRestaurant` lookup.
- **nginx (deploy step, not applied here):** route crawler user-agents for `/r/:id`
  to the prerender endpoint; humans keep the SPA. Add to the map server block:

  ```nginx
  map $http_user_agent $is_crawler {
      default 0;
      ~*(googlebot|bingbot|yandex|duckduckbot|baiduspider|facebookexternalhit|twitterbot|whatsapp|telegrambot|slackbot|linkedinbot|embedly|redditbot|applebot) 1;
  }
  # inside server { … }
  location ~ ^/r/([^/]+)$ {
      if ($is_crawler) { proxy_pass http://api_upstream/api/map/prerender/$1; }
      try_files $uri /index.html;   # humans → SPA
  }
  ```

Alternatives considered: (2) static prerender writing `/r/<id>.html` at deploy —
needs DB access in the build step; (3) migrate to an SSR framework — cleanest but
largest change. Option 1 wins on SEO value per unit of risk and reuses the existing
data path.

Remaining follow-ups: raster `og-image.png`, apple-touch PNG, and applying the
nginx block above on the server.
