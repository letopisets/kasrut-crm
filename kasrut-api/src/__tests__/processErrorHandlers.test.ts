import {
  createUncaughtExceptionHandler,
  createUnhandledRejectionHandler,
  installProcessErrorHandlers,
} from '../lib/processErrorHandlers'

// Node 22 exits on an unhandled rejection unless a listener is registered, and
// an uncaught exception left the buffered service logs unflushed.

function deps(flush: () => Promise<void> = jest.fn().mockResolvedValue(undefined)) {
  return {
    logger: { error: jest.fn(), fatal: jest.fn() },
    flush: jest.fn(flush),
    exit: jest.fn(),
    stopAccepting: jest.fn(),
  }
}

const settle = () => new Promise<void>(resolve => setImmediate(resolve))

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('unhandledRejection handler', () => {
  it('logs the reason and keeps the process running', () => {
    const d = deps()
    const reason = new Error('stray rejection')
    createUnhandledRejectionHandler(d)(reason)

    expect(d.logger.error).toHaveBeenCalledWith({ err: reason }, 'Unhandled promise rejection')
    expect(d.logger.fatal).not.toHaveBeenCalled()
    expect(d.flush).not.toHaveBeenCalled()
    expect(d.exit).not.toHaveBeenCalled()
  })

  it('accepts non-Error reasons', () => {
    const d = deps()
    createUnhandledRejectionHandler(d)('plain string')
    expect(d.logger.error).toHaveBeenCalledWith({ err: 'plain string' }, 'Unhandled promise rejection')
  })
})

describe('uncaughtException handler', () => {
  it('logs fatal, flushes the service logs, then exits with 1', async () => {
    let finishFlush!: () => void
    const d = deps(() => new Promise<void>(resolve => { finishFlush = resolve }))
    const err = new Error('boom')

    createUncaughtExceptionHandler(d)(err, 'uncaughtException')
    expect(d.logger.fatal).toHaveBeenCalledWith({ err, origin: 'uncaughtException' }, 'Uncaught exception, exiting')

    await settle()
    expect(d.flush).toHaveBeenCalledTimes(1)
    expect(d.exit).not.toHaveBeenCalled()

    finishFlush()
    await settle()
    expect(d.exit).toHaveBeenCalledTimes(1)
    expect(d.exit).toHaveBeenCalledWith(1)
  })

  it('stops accepting connections before the flush starts', async () => {
    const d = deps()

    createUncaughtExceptionHandler(d)(new Error('boom'))
    // Synchronously, before any await: no new request may reach the process.
    expect(d.stopAccepting).toHaveBeenCalledTimes(1)
    expect(d.flush).not.toHaveBeenCalled()

    await settle()
    expect(d.stopAccepting.mock.invocationCallOrder[0]).toBeLessThan(d.flush.mock.invocationCallOrder[0])
    expect(d.exit).toHaveBeenCalledWith(1)
  })

  it('still flushes and exits with 1 when closing the server throws', async () => {
    const closeErr = new Error('ERR_SERVER_NOT_RUNNING')
    const d = deps()
    d.stopAccepting.mockImplementation(() => { throw closeErr })

    createUncaughtExceptionHandler(d)(new Error('boom'))
    await settle()

    expect(d.logger.error).toHaveBeenCalledWith({ err: closeErr }, 'Closing the HTTP server before exit failed')
    expect(d.flush).toHaveBeenCalledTimes(1)
    expect(d.exit).toHaveBeenCalledWith(1)
  })

  it('works without a stopAccepting hook', async () => {
    const d = { ...deps(), stopAccepting: undefined }

    createUncaughtExceptionHandler(d)(new Error('boom'))
    await settle()

    expect(d.flush).toHaveBeenCalledTimes(1)
    expect(d.exit).toHaveBeenCalledWith(1)
  })

  it('still exits with 1 when the flush rejects', async () => {
    const flushErr = new Error('db gone')
    const d = deps(() => Promise.reject(flushErr))

    createUncaughtExceptionHandler(d)(new Error('boom'))
    await settle()

    expect(d.logger.error).toHaveBeenCalledWith({ err: flushErr }, 'service_logs flush before exit failed')
    expect(d.exit).toHaveBeenCalledWith(1)
  })

  it('still exits with 1 when the flush throws synchronously', async () => {
    const d = deps(() => { throw new Error('sync throw') })

    createUncaughtExceptionHandler(d)(new Error('boom'))
    await settle()

    expect(d.exit).toHaveBeenCalledWith(1)
  })

  it('does not wait for a hung flush beyond the timeout', async () => {
    jest.useFakeTimers()
    const d = { ...deps(() => new Promise<void>(() => undefined)), flushTimeoutMs: 5_000 }

    createUncaughtExceptionHandler(d)(new Error('boom'))
    await jest.advanceTimersByTimeAsync(4_999)
    expect(d.exit).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(1)
    expect(d.exit).toHaveBeenCalledWith(1)
  })

  it('defaults the flush timeout to 5 seconds', async () => {
    jest.useFakeTimers()
    const d = deps(() => new Promise<void>(() => undefined))

    createUncaughtExceptionHandler(d)(new Error('boom'))
    await jest.advanceTimersByTimeAsync(4_999)
    expect(d.exit).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(1)
    expect(d.exit).toHaveBeenCalledWith(1)
  })

  it('logs a second exception during the flush without flushing or exiting twice', async () => {
    let finishFlush!: () => void
    const d = deps(() => new Promise<void>(resolve => { finishFlush = resolve }))
    const handler = createUncaughtExceptionHandler(d)

    handler(new Error('first'))
    await settle()
    handler(new Error('second'))
    finishFlush()
    await settle()

    expect(d.logger.fatal).toHaveBeenCalledTimes(2)
    expect(d.stopAccepting).toHaveBeenCalledTimes(1)
    expect(d.flush).toHaveBeenCalledTimes(1)
    expect(d.exit).toHaveBeenCalledTimes(1)
  })
})

describe('installProcessErrorHandlers', () => {
  it('registers both listeners on process', () => {
    const onSpy = jest.spyOn(process, 'on').mockImplementation((() => process) as unknown as typeof process.on)
    installProcessErrorHandlers(deps())

    expect(onSpy.mock.calls.map(([event]) => event)).toEqual(['unhandledRejection', 'uncaughtException'])
  })
})

describe('server.ts', () => {
  it('installs the handlers; an uncaught exception closes the server, flushes service logs and exits 1', async () => {
    const listeners = new Map<string | symbol, (...args: unknown[]) => void>()
    jest.spyOn(process, 'on').mockImplementation(((event: string | symbol, listener: (...args: unknown[]) => void) => {
      listeners.set(event, listener)
      return process
    }) as unknown as typeof process.on)
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as typeof process.exit)
    const flush  = jest.fn().mockResolvedValue(undefined)
    const close  = jest.fn()
    const listen = jest.fn(() => ({ close }))

    jest.isolateModules(() => {
      jest.doMock('../app', () => ({ createApp: () => ({ listen }) }))
      jest.doMock('../jobs/expiryNotifier', () => ({}))
      jest.doMock('../db/serviceLogs.repo', () => ({
        serviceLogsRepo: { flush, rotate: jest.fn().mockResolvedValue(0) },
      }))
      // server.ts purges expired tokens at startup; unmocked, that opens a
      // real pg connection which outlives the test (CI has a Postgres on
      // localhost:5432 and no DATABASE_URL, so pg crashes the jest process).
      jest.doMock('../lib/tokenPurge', () => ({
        purgeExpiredTokens: jest.fn().mockResolvedValue({ deleted: {}, failed: {} }),
      }))
      require('../server')
    })

    expect(listen).toHaveBeenCalled()
    expect(listeners.has('unhandledRejection')).toBe(true)
    expect(listeners.has('uncaughtException')).toBe(true)

    // A stray rejection is survivable.
    listeners.get('unhandledRejection')!(new Error('stray'), Promise.resolve())
    await settle()
    expect(exitSpy).not.toHaveBeenCalled()
    expect(flush).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()

    listeners.get('uncaughtException')!(new Error('boom'), 'uncaughtException')
    await settle()
    expect(close).toHaveBeenCalledTimes(1)
    expect(flush).toHaveBeenCalledTimes(1)
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(flush.mock.invocationCallOrder[0])
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
