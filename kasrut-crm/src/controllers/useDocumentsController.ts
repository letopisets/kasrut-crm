import { useState } from 'react'
import { useAppSelector } from '@/store'
import { useGetDocumentsQuery, useCreateDocumentMutation, useDeleteDocumentMutation } from '@/store/api/documentsApi'
import { useGetRabbanutsQuery } from '@/store/api/rabbanutApi'
import { usePermissions } from '@/hooks/usePermissions'
import { useLang } from '@/i18n/useLang'
import { canDeleteDocument, documentScopeLabel, documentScopeOptions } from '@/lib/documents'
import type { CreateDocumentInput, DocumentCategory, KashrutDocument } from '@/types'

export function useDocumentsController() {
  const user = useAppSelector(s => s.auth.user)
  const role = useAppSelector(s => s.auth.role)
  const perm = usePermissions()
  const t    = useLang()
  const [category, setCategory] = useState<DocumentCategory | 'all'>('all')
  const [showUpload, setShowUpload] = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)

  const { data: all = [], isLoading } = useGetDocumentsQuery()
  // Owners get every rabbanut (scope selector + labels); tenant users get
  // only their own, which is all the labels need.
  const { data: rabbanuts = [] } = useGetRabbanutsQuery()
  const [createMutation] = useCreateDocumentMutation()
  const [deleteMutation] = useDeleteDocumentMutation()

  const documents = category === 'all' ? all : all.filter(d => d.category === category)

  // Only the owner chooses a scope.
  const scopeOptions = perm.isOwner ? documentScopeOptions(rabbanuts) : []

  const scopeLabel = (d: KashrutDocument) => documentScopeLabel(t, rabbanuts, d)
  const canDelete  = (d: KashrutDocument) => canDeleteDocument(role, user?.rabbanutId, d)

  const openUpload  = () => { setSaveError(null); setShowUpload(true) }
  const closeUpload = () => { setSaveError(null); setShowUpload(false) }

  const uploadDocument = async (data: CreateDocumentInput) => {
    setSaving(true); setSaveError(null)
    try {
      await createMutation(data).unwrap()
      setShowUpload(false)
    } catch {
      setSaveError(t.documents.saveError)
    } finally {
      setSaving(false)
    }
  }

  const deleteDocument = (id: string) => {
    if (!window.confirm(t.documents.deleteConfirm)) return
    void deleteMutation(id)
  }

  return {
    documents, isLoading,
    category, setCategory,
    showUpload, openUpload, closeUpload,
    saveError, saving,
    canEdit: perm.canEdit,
    isOwner: perm.isOwner,
    scopeOptions, scopeLabel, canDelete,
    uploadDocument, deleteDocument,
  }
}
