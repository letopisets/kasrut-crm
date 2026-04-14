import { baseApi } from './baseApi'
import type { KashrutDocument, DocumentCategory } from '@/types'

export const documentsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getDocuments: build.query<KashrutDocument[], { category?: DocumentCategory } | void>({
      query: (params) => {
        const q = new URLSearchParams()
        if (params?.category) q.set('category', params.category)
        return `/documents${q.toString() ? `?${q}` : ''}`
      },
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Document' as const, id })), 'Document']
          : ['Document'],
    }),
    createDocument: build.mutation<KashrutDocument, Omit<KashrutDocument, 'id'>>({
      query: (body) => ({ url: '/documents', method: 'POST', body }),
      invalidatesTags: ['Document'],
    }),
    deleteDocument: build.mutation<void, string>({
      query: (id) => ({ url: `/documents/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Document'],
    }),
  }),
})

export const {
  useGetDocumentsQuery,
  useCreateDocumentMutation,
  useDeleteDocumentMutation,
} = documentsApi
