# @kasrut/shared

Single source of truth for types and contracts shared between
`kasrut-api`, `kasrut-crm` and `kasrut-map`.

Imported via relative paths (no npm workspaces, no build step):

```ts
import type { Page, MapAuthProvider } from '../../../packages/shared/types'
```

Each consumer's `types/index.ts` re-exports from here, so existing
project-internal imports keep working.
