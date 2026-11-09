/**
 * A failure the client can act on, sent as `{ error: { code, message, details? } }` with `status`.
 * Anything else that's thrown becomes a 500 with a generic message (and is logged).
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'invalid_request', message, details);
export const unauthorized = (message = 'Sign in to continue.') => new AppError(401, 'unauthenticated', message);
export const forbidden = (message = 'You don’t have access to this.') => new AppError(403, 'forbidden', message);
export const notFound = (what = 'That') => new AppError(404, 'not_found', `${what} wasn’t found.`);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details);
export const unavailable = (code: string, message: string) => new AppError(503, code, message);
