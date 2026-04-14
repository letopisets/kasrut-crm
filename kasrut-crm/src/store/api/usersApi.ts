import { baseApi } from './baseApi'
import type { User, Role } from '@/types'

export const usersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getUsers: build.query<User[], { role?: Role } | void>({
      query: (params) => {
        const q = new URLSearchParams()
        if (params?.role) q.set('role', params.role)
        return `/users${q.toString() ? `?${q}` : ''}`
      },
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'User' as const, id })), 'User']
          : ['User'],
    }),
    createUser: build.mutation<User, { name: string; email: string; password: string; role: Role; rabbanutId?: string }>({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      invalidatesTags: ['User'],
    }),
    updateUser: build.mutation<User, { id: string; patch: Partial<User> }>({
      query: ({ id, patch }) => ({ url: `/users/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'User', id }],
    }),
    deleteUser: build.mutation<void, string>({
      query: (id) => ({ url: `/users/${id}`, method: 'DELETE' }),
      invalidatesTags: ['User'],
    }),
  }),
})

export const {
  useGetUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
} = usersApi
