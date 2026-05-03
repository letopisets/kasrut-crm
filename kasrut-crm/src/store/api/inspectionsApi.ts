import { baseApi } from './baseApi'
import type { Inspection, InspectionResult } from '@/types'

export interface InspectionsPage {
  items:      Inspection[]
  nextCursor: string | null
}

export const inspectionsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getInspections: build.query<Inspection[], { restaurantId?: string; mashgiachId?: string; result?: string; type?: string } | void>({
      query: (params) => {
        const q = new URLSearchParams()
        if (params?.restaurantId) q.set('restaurantId', params.restaurantId)
        if (params?.mashgiachId)  q.set('mashgiachId',  params.mashgiachId)
        if (params?.result)       q.set('result',       params.result)
        if (params?.type)         q.set('type',         params.type)
        return `/inspections${q.toString() ? `?${q}` : ''}`
      },
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Inspection' as const, id })), 'Inspection']
          : ['Inspection'],
    }),
    getInspectionsPage: build.query<InspectionsPage, { restaurantId?: string; mashgiachId?: string; result?: string; type?: string; limit: number; cursor?: string }>({
      query: ({ restaurantId, mashgiachId, result, type, limit, cursor }) => {
        const q = new URLSearchParams()
        if (restaurantId) q.set('restaurantId', restaurantId)
        if (mashgiachId)  q.set('mashgiachId',  mashgiachId)
        if (result)       q.set('result',       result)
        if (type)         q.set('type',         type)
        q.set('limit', String(limit))
        if (cursor) q.set('cursor', cursor)
        return `/inspections?${q}`
      },
      providesTags: (result) =>
        result
          ? [...result.items.map(({ id }) => ({ type: 'Inspection' as const, id })), 'Inspection']
          : ['Inspection'],
    }),
    createInspection: build.mutation<Inspection, Omit<Inspection, 'id' | 'result'>>({
      query: (body) => ({ url: '/inspections', method: 'POST', body }),
      invalidatesTags: ['Inspection'],
    }),
    setInspectionResult: build.mutation<Inspection, { id: string; result: InspectionResult }>({
      query: ({ id, result }) => ({ url: `/inspections/${id}`, method: 'PATCH', body: { result } }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Inspection', id }],
    }),
    deleteInspection: build.mutation<void, string>({
      query: (id) => ({ url: `/inspections/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Inspection'],
    }),
  }),
})

export const {
  useGetInspectionsQuery,
  useGetInspectionsPageQuery,
  useCreateInspectionMutation,
  useSetInspectionResultMutation,
  useDeleteInspectionMutation,
} = inspectionsApi
