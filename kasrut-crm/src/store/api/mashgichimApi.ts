import { baseApi } from './baseApi'
import type { Mashgiach } from '@/types'

type CreateInput = Omit<Mashgiach, 'id' | 'assignedRestaurantIds'>

export const mashgichimApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMashgichim: build.query<Mashgiach[], { rabbanutId?: string; active?: boolean } | void>({
      query: (params) => {
        const q = new URLSearchParams()
        if (params?.rabbanutId !== undefined)  q.set('rabbanutId', params.rabbanutId)
        if (params?.active     !== undefined)  q.set('active', String(params.active))
        return `/mashgichim${q.toString() ? `?${q}` : ''}`
      },
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Mashgiach' as const, id })), 'Mashgiach']
          : ['Mashgiach'],
    }),
    createMashgiach: build.mutation<Mashgiach, CreateInput>({
      query: (body) => ({ url: '/mashgichim', method: 'POST', body }),
      invalidatesTags: ['Mashgiach'],
    }),
    updateMashgiach: build.mutation<Mashgiach, { id: string; patch: Partial<Mashgiach> }>({
      query: ({ id, patch }) => ({ url: `/mashgichim/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Mashgiach', id }],
    }),
    toggleMashgiach: build.mutation<Mashgiach, string>({
      query: (id) => ({ url: `/mashgichim/${id}/toggle`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Mashgiach', id }],
    }),
    deleteMashgiach: build.mutation<void, string>({
      query: (id) => ({ url: `/mashgichim/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Mashgiach'],
    }),
  }),
})

export const {
  useGetMashgichimQuery,
  useCreateMashgiachMutation,
  useUpdateMashgiachMutation,
  useToggleMashgiachMutation,
  useDeleteMashgiachMutation,
} = mashgichimApi
