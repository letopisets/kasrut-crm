import { baseApi } from './baseApi'
import type { Inspection, InspectionResult } from '@/types'

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
  useCreateInspectionMutation,
  useSetInspectionResultMutation,
  useDeleteInspectionMutation,
} = inspectionsApi
