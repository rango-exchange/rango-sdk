// Resolves early once `signal` aborts, so a paused task stops waiting.
export async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const wake = (): void => {
      clearTimeout(timeout)
      resolve()
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', wake)
      resolve()
    }, ms)
    signal.addEventListener('abort', wake, { once: true })
  })
}
