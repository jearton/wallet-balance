// One initial read plus at most three retries. Only read-only node calls use this.
export async function withNodeRetries<T>(
  read: () => Promise<T>,
  { retries = 3, delay = 150 } = {},
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      if (
        (typeof error === "object" &&
          error !== null &&
          "retryable" in error &&
          error.retryable === false) ||
        attempt >= retries
      )
        throw error;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay * (attempt + 1)));
    }
  }
}
