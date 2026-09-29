import crypto from 'crypto'

/**
 * Id of the copy of mashgiach profile `baseId` that lives in rabbanut
 * `rabbanutId`, when the profile itself belongs to another rabbanut.
 *
 * MUST stay identical to migration 20260714095000_split_cross_tenant_mashgichim
 * (`M.id || '__' || left(md5(T), 10)`): the importer and the migration have to
 * agree so that a re-import lands on the rows the migration created.
 */
export function tenantMashgiachId(baseId: string, rabbanutId: string): string {
  const suffix = crypto.createHash('md5').update(rabbanutId, 'utf8').digest('hex').slice(0, 10)
  return `${baseId}__${suffix}`
}

export interface TenantMashgiachDraft {
  /** Tenant-independent id (the importer placeholder, or derived from phone/name). */
  baseId: string
  rabbanutId: string
}

/**
 * Assigns every (baseId, rabbanutId) draft its database id. The OWNER tenant of
 * a base id keeps the base id; every other tenant gets tenantMashgiachId().
 *
 * The owner is the tenant of the existing row with that id (`existingOwners`,
 * read from the database) or, for a base id the database does not have yet,
 * the tenant of the first draft in iteration order.
 */
export function resolveTenantMashgiachIds<T extends TenantMashgiachDraft>(
  drafts: Iterable<T>,
  existingOwners: ReadonlyMap<string, string> = new Map(),
): Map<T, string> {
  const owners = new Map(existingOwners)
  const ids = new Map<T, string>()
  for (const draft of drafts) {
    if (!owners.has(draft.baseId)) owners.set(draft.baseId, draft.rabbanutId)
    ids.set(
      draft,
      owners.get(draft.baseId) === draft.rabbanutId
        ? draft.baseId
        : tenantMashgiachId(draft.baseId, draft.rabbanutId),
    )
  }
  return ids
}
