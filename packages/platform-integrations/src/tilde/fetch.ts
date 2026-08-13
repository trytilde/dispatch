/** Compose a provider call's cancellation signal into Tilde HTTP requests. */
export function tildeFetch(signal: AbortSignal): typeof fetch {
  return (input, init) => {
    const requestSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    return fetch(input, {
      ...init,
      signal: requestSignal ? AbortSignal.any([requestSignal, signal]) : signal,
    });
  };
}
