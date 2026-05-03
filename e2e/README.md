# Kasrut E2E Tests

Playwright-based end-to-end tests covering critical user flows in
`kasrut-crm` and `kasrut-map`.

## Prerequisites

- A running backend (kasrut-api) connected to a seeded database
- CRM dev server (default `http://localhost:5173`)
- Map dev server (default `http://localhost:5174`)
- Optional: override URLs via `CRM_URL`, `MAP_URL`, `E2E_EMAIL`,
  `E2E_PASSWORD` environment variables
- The default E2E user should be an owner/admin account and should start
  with 2FA disabled. The 2FA test enables it and disables it again.
- Seed data must include at least one rabbanut/authority and one hechsher
  so the restaurant CRUD form can select required options.

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

## Coverage

- CRM login success and invalid-password error
- CRM 2FA settings: enable and disable with generated TOTP
- CRM restaurant CRUD: create, edit, delete
- Public map: map render and filter panel

## CI integration

Currently NOT wired into `.github/workflows/ci.yml` because the workflow
would need to spin up Postgres + Redis + the backend + both frontends
plus seeding before it could run. Once a `docker-compose.test.yml` is
introduced, add an `e2e` job to CI that does:

```yaml
- run: docker compose -f docker-compose.test.yml up -d --wait
- run: cd e2e && npm install && npx playwright install --with-deps chromium && npm test
```

Once `e2e/package-lock.json` is committed, switch the second command to
`npm ci` for deterministic installs.
