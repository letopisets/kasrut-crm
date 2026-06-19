import { baseApi } from './baseApi'
import type { EstablishmentCategory } from '@/types'

export const establishmentCategoriesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getEstablishmentCategories: build.query<EstablishmentCategory[], void>({
      query: () => '/establishment-categories',
      providesTags: ['EstablishmentCategory'],
    }),
  }),
})

export const { useGetEstablishmentCategoriesQuery } = establishmentCategoriesApi
