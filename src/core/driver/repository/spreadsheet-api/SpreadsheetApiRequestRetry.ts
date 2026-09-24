import axios from 'axios';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_INITIAL_DELAY_IN_MILLISECONDS = 500;
const DEFAULT_MAX_DELAY_IN_MILLISECONDS = 4_000;

export interface SpreadsheetApiRequestRetryOptions {
  maxAttempts?: number;
  initialDelayInMilliseconds?: number;
  maxDelayInMilliseconds?: number;
}

/**
 * The Spreadsheet API times out every so often — it reads a live Google Sheet,
 * so a slow read is normal rather than a failure. Every call through here is a
 * plain GET of one row, which makes repeating it free: nothing is written and
 * the same row comes back.
 *
 * Without this, only the bulk queue recovered, because it retries the whole
 * job; invoicing a single TLQV from the panel had no second chance and a blip
 * blocked it outright.
 */
export async function executeSpreadsheetApiRequestWithRetry<T>(
  operation: () => Promise<T>,
  options: SpreadsheetApiRequestRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  validateMaxAttempts(maxAttempts);

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error: unknown) {
      if (attempt >= maxAttempts || !isRetryableSpreadsheetApiError(error)) {
        throw error;
      }

      await wait(calculateDelayInMilliseconds(attempt, options));
    }
  }
}

function isRetryableSpreadsheetApiError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  const status = error.response?.status;
  if (status === undefined) {
    // No answer at all: the timeout this exists for.
    return true;
  }

  // A 404 means the row is not in the sheet, which the callers turn into
  // `found: false`. Retrying it would only delay that answer.
  return status === 408 || status === 429 || status >= 500;
}

function calculateDelayInMilliseconds(
  attempt: number,
  options: SpreadsheetApiRequestRetryOptions,
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
