/**
 * Process-level safety nets, installed once by src/server.ts.
 *
 * - unhandledRejection: a stray promise (a fire-and-forget call, a handler
 *   that escaped asyncHandler) is logged and the API keeps serving. Without a
 *   listener Node 22 turns it into an uncaught exception and exits.
 * - uncaughtException: the process state is unknown, so it logs, stops
 *   accepting connections, makes a bounded attempt to flush buffered service
 *   logs and exits with 1 for Docker (restart: unless-stopped) to start a
 *   clean instance.
 */

interface ProcessErrorLogger {
  error(obj: object, msg: string): void
  fatal(obj: object, msg: string): void
}

export interface ProcessErrorHandlerDeps {
  logger: ProcessErrorLogger
  /** Best-effort flush of buffered log rows before exiting. */
  flush: () => Promise<void>
  exit: (code: number) => void
  /** Stops the HTTP server from taking new connections, so the broken process
   *  serves no fresh requests while the flush runs. */
  stopAccepting?: () => void
  /** Upper bound on the flush, so a crash caused by a hung database cannot
   *  keep a broken process alive. */
  flushTimeoutMs?: number
}

const DEFAULT_FLUSH_TIMEOUT_MS = 5_000

export function createUnhandledRejectionHandler(
  deps: Pick<ProcessErrorHandlerDeps, 'logger'>,
): (reason: unknown) => void {
  return reason => {
    deps.logger.error({ err: reason }, 'Unhandled promise rejection')
  }
}

export function createUncaughtExceptionHandler(
  deps: ProcessErrorHandlerDeps,
): (err: Error, origin?: string) => void {
  const flushTimeoutMs = deps.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS
  let exiting = false

  return (err, origin) => {
    deps.logger.fatal({ err, origin }, 'Uncaught exception, exiting')
    // A second exception while the flush is pending is logged above, but must
    // not start another flush or exit twice.
    if (exiting) return
    exiting = true

    try {
      deps.stopAccepting?.()
    } catch (closeErr) {
      deps.logger.error({ err: closeErr }, 'Closing the HTTP server before exit failed')
    }

    let timer: NodeJS.Timeout | undefined
    const timedOut = new Promise<void>(resolve => { timer = setTimeout(resolve, flushTimeoutMs) })
    const flushed = Promise.resolve()
      .then(deps.flush)
      .catch((flushErr: unknown) => {
        deps.logger.error({ err: flushErr }, 'service_logs flush before exit failed')
      })

    void Promise.race([flushed, timedOut]).then(() => {
      clearTimeout(timer)
      deps.exit(1)
    })
  }
}

export function installProcessErrorHandlers(deps: ProcessErrorHandlerDeps): void {
  process.on('unhandledRejection', createUnhandledRejectionHandler(deps))
  process.on('uncaughtException', createUncaughtExceptionHandler(deps))
}
