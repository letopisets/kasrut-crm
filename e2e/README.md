# Kasrut E2E Tests

Playwright-based end-to-end tests covering critical user flows in
`kasrut-crm` and `kasrut-map`.

## Prerequisites

- A running backend (kasrut-api) connected to a seeded database
- CRM dev server (default `http://localhost:5173`)
- Map dev server (default `http://localhost:5174`)
- Optional: override URLs via `CRM_URL`, `MAP_URL`, `E2E_EMAIL`,
  `E2E_PASSWORD` environment variables

## Running locally

```sh
cd e2e
npm install
npx playwright install chromium
npm test
```

## Running specific projects

```sh
npx playwright test --project=crm
npx playwright test --project=map
```

## CI integration

Currently NOT wired into `.github/workflows/ci.yml` because the workflow
would need to spin up Postgres + Redis + the backend + both frontends
plus seeding before it could run. Once a `docker-compose.test.yml` is
introduced, add an `e2e` job to CI that does:

```yaml
- run: docker compose -f docker-compose.test.yml up -d --wait
- run: cd e2e && npm ci && npx playwright install --with-deps chromium && npm test
```
