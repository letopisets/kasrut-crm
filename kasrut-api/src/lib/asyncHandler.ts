import type { Request, Response, NextFunction } from 'express'

type AsyncController = (req: Request, res: Response) => Promise<void>

/** Wraps an async route handler so thrown errors propagate to Express next(). */
export const asyncHandler =
  (fn: AsyncController) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next)
  }
