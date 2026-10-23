/**
 * Structural view of a thrown value.
 *
 * Catch bindings are `unknown` under `strict` (`useUnknownInCatchVariables`), and
 * an explicit `any` annotation is banned by lint. Call sites that only need the
 * message/name/code of whatever was thrown go through `asErrorLike` instead of
 * widening the binding back to `any`.
 */
export interface ErrorLike {
  message?: string;
  name?: string;
  code?: string | number;
  stack?: string;
  cause?: unknown;
}

export function asErrorLike(value: unknown): ErrorLike {
  if (value instanceof Error) return value;
  if (typeof value === 'object' && value !== null) return value as ErrorLike;
  return { message: String(value) };
}
