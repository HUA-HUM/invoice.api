import axios from 'axios';

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_INITIAL_DELAY_IN_MILLISECONDS = 1_000;
const DEFAULT_MAX_DELAY_IN_MILLISECONDS = 10_000;

export interface XubioRequestRetryOptions {
  maxAttempts?: number;
  initialDelayInMilliseconds?: number;
  maxDelayInMilliseconds?: number;
  onAuthorizationFailure?: () => void | Promise<void>;
  /**
   * A timeout, a dropped connection, a 408 or a 5xx leave the outcome
   * indeterminate: Xubio may well have processed the request before the answer
   * got lost. Reads can be repeated safely, so this defaults to true; anything
   * that writes a fiscal document must set it to false, or one timeout ends up
   * issuing the same comprobante several times.
   */
  retryOnIndeterminateOutcome?: boolean;
}

export async function executeXubioRequestWithRetry<T>(
  operation: () => Promise<T>,
  options: XubioRequestRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  validateMaxAttempts(maxAttempts);

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error: unknown) {
      if (
        attempt >= maxAttempts ||
        !isRetryableXubioRequestError(error, options)
      ) {
        throw error;
      }

      if (isAuthorizationError(error)) {
        await options.onAuthorizationFailure?.();
      }

      await wait(calculateDelayInMilliseconds(attempt, options));
    }
  }
}

function isRetryableXubioRequestError(
  error: unknown,
  options: XubioRequestRetryOptions,
): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  const status = error.response?.status;
  if (status === undefined) {
    return isIndeterminateOutcomeRetryable(options);
  }

  if (isAuthorizationStatus(status)) {
    return options.onAuthorizationFailure !== undefined;
  }

  // A 429 is the one failure that is certainly not processed: Xubio rejected
  // the request before doing anything with it.
  if (status === 429) {
    return true;
  }

  return (
    (status === 408 || status >= 500) &&
    isIndeterminateOutcomeRetryable(options)
  );
}

function isIndeterminateOutcomeRetryable(
  options: XubioRequestRetryOptions,
): boolean {
  return options.retryOnIndeterminateOutcome ?? true;
}

function isAuthorizationError(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    error.response?.status !== undefined &&
    isAuthorizationStatus(error.response.status)
  );
}

function isAuthorizationStatus(status: number): boolean {
  return status === 401 || status === 403;
}

function calculateDelayInMilliseconds(
  attempt: number,
  options: XubioRequestRetryOptions,
): number {
  const initialDelay =
    options.initialDelayInMilliseconds ?? DEFAULT_INITIAL_DELAY_IN_MILLISECONDS;
  const maxDelay =
    options.maxDelayInMilliseconds ?? DEFAULT_MAX_DELAY_IN_MILLISECONDS;

  return Math.min(initialDelay * 2 ** (attempt - 1), maxDelay);
}

function validateMaxAttempts(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError('maxAttempts must be a positive integer');
  }
}

function wait(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
