export type ServiceLogLevel = 'info' | 'warn' | 'error'

export interface ServiceLog {
  id: string
  createdAt: string
  level: ServiceLogLevel
  service: string
  action?: string
  message: string
  userId?: string
  userEmail?: string
  userRole?: string
  entityType?: string
  entityId?: string
  method?: string
  path?: string
  statusCode?: number
  requestId?: string
  metadata?: unknown
}

export interface ServiceLogSummary {
  errors24h: number
  warnings24h: number
  authIssues: number
  api5xx: number
}

export interface ServiceLogsResponse {
  logs: ServiceLog[]
  summary: ServiceLogSummary
}
