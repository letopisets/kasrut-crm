import { baseApi } from './baseApi'

export interface DashboardSummary {
  activeRestaurants: number
  expiringSoon:      number
  openInspections:   number
  logsToday:         number
}

export const dashboardApi = baseApi.injectEndpoints({
  endpoints: build => ({
    getDashboardSummary: build.query<DashboardSummary, void>({
      query: () => '/dashboard/summary',
    }),
  }),
})

export const { useGetDashboardSummaryQuery } = dashboardApi
