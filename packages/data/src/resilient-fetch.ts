// Safety net for the reads of the admin and the apps (R11). On the Nano a read can hang behind a throttled CPU or come
// back as 57014 (statement timeout): without a limit a screen stayed on «Cargando…» forever, and a single failure
// showed as «Pedido no encontrado». Every request now has a time limit, and a read that failed for a reason that may
// pass (5xx, 57014, network) is sent again ONCE after a short random wait. Never retried: writes, the caller's own
// abort and our own timeout (aborting in the browser does not cancel the statement in Postgres, so a retry there would
// only double the load on a database that is already drowning).

export type ResilientFetchOptions = {
  /** Abort the request after this long (it must stay above the 8 s statement_timeout of the API roles). */
  timeoutMs?: number;
  /** Whether this request may be sent again (reads only). */
  canRetry?: (init: RequestInit | undefined) => boolean;
  /** Wait before the retry (random 300–900 ms by default, so screens do not retry in lockstep). */
  retryDelayMs?: () => number;
};

export const DEFAULT_TIMEOUT_MS = 12_000;

/** Thrown when a request passes `timeoutMs`; callers can show «la conexión tardó demasiado». */
export class RequestTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super("La conexión tardó demasiado. Inténtalo de nuevo.");
    this.name = "RequestTimeoutError";
  }
}

const STATEMENT_TIMEOUT = /57014|statement timeout/;

/** A response worth one more try: a server error, or a GraphQL answer that carries a statement timeout. */
async function isTransient(response: Response): Promise<boolean> {
  if (response.status >= 500) return true;
  if (response.status !== 200 || !(response.headers.get("Content-Type") ?? "").includes("json")) return false;
  const text = await response
    .clone()
    .text()
    .catch(() => "");
  return text.includes('"errors"') && STATEMENT_TIMEOUT.test(text);
}

function withTimeout(signal: AbortSignal | null | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new RequestTimeoutError(timeoutMs)), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

export function createResilientFetch(
  baseFetch: typeof fetch,
  options: ResilientFetchOptions = {},
): typeof fetch {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? (() => 300 + Math.random() * 600);

  async function attempt(input: RequestInfo | URL, init: RequestInit | undefined): Promise<Response> {
    const limit = withTimeout(init?.signal, timeoutMs);
    try {
      return await baseFetch(input, { ...init, signal: limit.signal });
    } catch (error) {
      if (limit.signal.reason instanceof RequestTimeoutError) throw limit.signal.reason;
      throw error;
    } finally {
      limit.done();
    }
  }

  return async (input, init) => {
    const retry = options.canRetry?.(init) ?? false;
    let response: Response;
    try {
      response = await attempt(input, init);
    } catch (error) {
      // Network failure (offline, connection reset): one more try for reads; never after an abort or our timeout.
      if (!retry || init?.signal?.aborted || error instanceof RequestTimeoutError) throw error;
      if ((error as { name?: string } | null)?.name === "AbortError") throw error;
      await new Promise((r) => setTimeout(r, retryDelayMs()));
      return attempt(input, init);
    }
    if (!retry || !(await isTransient(response)) || init?.signal?.aborted) return response;
    await new Promise((r) => setTimeout(r, retryDelayMs()));
    return attempt(input, init);
  };
}
