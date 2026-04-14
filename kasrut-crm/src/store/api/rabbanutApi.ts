import { baseApi } from './baseApi'
import type { Rabbanut } from '@/types'

export const rabbanutApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getRabbanuts: build.query<Rabbanut[], { active?: boolean } | void>({
      query: (params) => {
        const q = new URLSearchParams()
        if (params?.active !== undefined) q.set('active', String(params.active))
        return `/rabbanuts${q.toString() ? `?${q}` : ''}`
      },
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Rabbanut' as const, id })), 'Rabbanut']
          : ['Rabbanut'],
    }),
    createRabbanut: build.mutation<Rabbanut, Omit<Rabbanut, 'id'>>({
      query: (body) => ({ url: '/rabbanuts', method: 'POST', body }),
      invalidatesTags: ['Rabbanut'],
    }),
    updateRabbanut: build.mutation<Rabbanut, { id: string; patch: Partial<Rabbanut> }>({
      query: ({ id, patch }) => ({ url: `/rabbanuts/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Rabbanut', id }],
    }),
    toggleRabbanut: build.mutation<Rabbanut, string>({
      query: (id) => ({ url: `/rabbanuts/${id}/toggle`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Rabbanut', id }],
    }),
    deleteRabbanut: build.mutation<void, string>({
      query: (id) => ({ url: `/rabbanuts/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Rabbanut'],
    }),
  }),
})

export const {
  useGetRabbanutsQuery,
  useCreateRabbanutMutation,
  useUpdateRabbanutMutation,
  useToggleRabbanutMutation,
  useDeleteRabbanutMutation,
} = rabbanutApi
