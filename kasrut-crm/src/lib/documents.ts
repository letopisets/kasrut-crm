import type { Translations } from '@/i18n/types'
import type { DocumentCategory, KashrutDocument, Rabbanut, Role } from '@/types'
import type { SelectOption } from '@/components/ui'

export const DOCUMENT_CATEGORIES: DocumentCategory[] = ['Instructions', 'Forms', 'Regulations', 'Pesach']

/** t.documents.categories is ['All', ...DOCUMENT_CATEGORIES] in every language. */
export function documentCategoryLabel(t: Translations, category: DocumentCategory): string {
  const i = DOCUMENT_CATEGORIES.indexOf(category)
  return i < 0 ? category : t.documents.categories[i + 1]
}

/** Mirrors the API: the owner deletes anything, a rabbanut only its own
 *  tenant's documents (never global ones), a mashgiach nothing. */
export function canDeleteDocument(role: Role, userRabbanutId: string | undefined, d: KashrutDocument): boolean {
  if (role === 'owner') return true
  return role === 'rabbanut' && !!d.rabbanutId && d.rabbanutId === userRabbanutId
}

/** Owner scope selector: active rabbanuts only, the API rejects inactive ones. */
export function documentScopeOptions(rabbanuts: Rabbanut[]): SelectOption[] {
  return rabbanuts.filter(r => r.active).map(r => ({ value: r.id, label: r.name }))
}

/** "Global", the owning rabbanut's name, or a neutral label when that
 *  rabbanut is not in the list (soft-deleted, or still loading). */
export function documentScopeLabel(t: Translations, rabbanuts: Rabbanut[], d: KashrutDocument): string {
  if (!d.rabbanutId) return t.documents.global
  return rabbanuts.find(r => r.id === d.rabbanutId)?.name ?? t.documents.unknownScope
}
