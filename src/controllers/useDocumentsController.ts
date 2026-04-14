import { useState } from 'react'
import { useGetDocumentsQuery, useCreateDocumentMutation, useDeleteDocumentMutation } from '@/store/api/documentsApi'
import { usePermissions } from '@/hooks/usePermissions'
import type { DocumentCategory, KashrutDocument } from '@/types'

export function useDocumentsController() {
  const perm = usePermissions()
  const [category, setCategory] = useState<DocumentCategory | 'all'>('all')
  const [showUpload, setShowUpload] = useState(false)

  const { data: all = [], isLoading } = useGetDocumentsQuery()
  const [createMutation] = useCreateDocumentMutation()
  const [deleteMutation] = useDeleteDocumentMutation()

  const documents = category === 'all' ? all : all.filter(d => d.category === category)

  const uploadDocument = async (data: Omit<KashrutDocument, 'id'>) => {
    await createMutation(data).unwrap()
    setShowUpload(false)
  }

  const deleteDocument = (id: string) => { void deleteMutation(id) }

  return {
    documents, isLoading,
    category, setCategory,
    showUpload, openUpload: () => setShowUpload(true), closeUpload: () => setShowUpload(false),
    canEdit: perm.canEdit,
    uploadDocument, deleteDocument,
  }
}
