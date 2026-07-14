export async function waitUntilQueueReady(
  queue: {
    waitUntilReady(): Promise<unknown>;
  },
  timeoutInMilliseconds: number,
): Promise<void> {
  await withTimeout(
    queue.waitUntilReady().then(() => undefined),
    timeoutInMilliseconds,
  );
}

export function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }

  return 'Unknown error';
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutInMilliseconds: number,
): Promise<T> {
  if (timeoutInMilliseconds === 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `Queue did not become ready within ${timeoutInMilliseconds}ms`,
        ),
      );
    }, timeoutInMilliseconds);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(toError(error));
      },
    );
  });
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(readErrorMessage(error));
}
