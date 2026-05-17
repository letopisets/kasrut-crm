import { baseApi } from './baseApi'
import type { KashrutLevel } from '@/types'

export const kashrutLevelsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getKashrutLevels: build.query<KashrutLevel[], void>({
      query: () => '/kashrut-levels',
      providesTags: ['KashrutLevel'],
    }),
    createKashrutLevel: build.mutation<KashrutLevel, Omit<KashrutLevel, 'id'>>({
      query: (body) => ({ url: '/kashrut-levels', method: 'POST', body }),
      invalidatesTags: ['KashrutLevel'],
    }),
    updateKashrutLevel: build.mutation<KashrutLevel, { id: string; patch: Partial<Omit<KashrutLevel, 'id'>> }>({
      query: ({ id, patch }) => ({ url: `/kashrut-levels/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: ['KashrutLevel'],
    }),
    deleteKashrutLevel: build.mutation<void, string>({
      query: (id) => ({ url: `/kashrut-levels/${id}`, method: 'DELETE' }),
      invalidatesTags: ['KashrutLevel'],
    }),
  }),
})

export const {
  useGetKashrutLevelsQuery,
  useCreateKashrutLevelMutation,
  useUpdateKashrutLevelMutation,
  useDeleteKashrutLevelMutation,
} = kashrutLevelsApi
