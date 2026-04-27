import { baseApi } from './baseApi'
import type { Hechsher } from '@/types'

export const hechsherimApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getHechsherById: build.query<Hechsher, string>({
      query: (id) => `/hechsherim/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Hechsher', id }],
    }),
    getHechsherim: build.query<Hechsher[], { rabbanutId?: string; type?: string } | void>({
      query: (params) => {
        const q = new URLSearchParams()
        if (params?.rabbanutId) q.set('rabbanutId', params.rabbanutId)
        if (params?.type)       q.set('type',       params.type)
        return `/hechsherim${q.toString() ? `?${q}` : ''}`
      },
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Hechsher' as const, id })), 'Hechsher']
          : ['Hechsher'],
    }),
    createHechsher: build.mutation<Hechsher, Omit<Hechsher, 'id'>>({
      query: (body) => ({ url: '/hechsherim', method: 'POST', body }),
      invalidatesTags: ['Hechsher'],
    }),
    updateHechsher: build.mutation<Hechsher, { id: string; patch: Partial<Hechsher> }>({
      query: ({ id, patch }) => ({ url: `/hechsherim/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Hechsher', id }],
    }),
    deleteHechsher: build.mutation<void, string>({
      query: (id) => ({ url: `/hechsherim/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Hechsher'],
    }),
  }),
})

export const {
  useGetHechsherByIdQuery,
  useGetHechsherimQuery,
  useCreateHechsherMutation,
  useUpdateHechsherMutation,
  useDeleteHechsherMutation,
} = hechsherimApi
