import { baseApi } from './baseApi'
import type { ServiceLogLevel, ServiceLogsResponse } from '@/types'

export const logsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getServiceLogs: build.query<ServiceLogsResponse, { level?: ServiceLogLevel | 'all'; service?: string; limit?: number } | void>({
      query: (params) => {
        const q = new URLSearchParams()
        if (params?.level && params.level !== 'all') q.set('level', params.level)
        if (params?.service) q.set('service', params.service)
        if (params?.limit) q.set('limit', String(params.limit))
        return `/logs${q.toString() ? `?${q}` : ''}`
      },
      providesTags: ['ServiceLog'],
    }),
  }),
})

export const { useGetServiceLogsQuery } = logsApi
