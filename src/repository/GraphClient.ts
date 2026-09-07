import type { AccessTokenProvider } from "../auth/AccessTokenProvider";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const RETRYABLE_STATUS = new Set([429, 503, 504]);
const MAX_UPLOAD_RETRY_DELAY_MS = 30_000;

type Sleep = (milliseconds: number) => Promise<void>;

export interface GraphUploadProgress {
  loadedBytes: number;
  totalBytes: number;
  attempt: number;
}

interface GraphUploadTransportInput {
  url: string;
  accessToken: string;
  body: Blob;
  headers: Headers;
  signal?: AbortSignal;
  attempt: number;
  onProgress?: (progress: GraphUploadProgress) => void;
}

interface GraphUploadTransportResponse {
  status: number;
  responseText: string;
  retryAfter: string | null;
}

export type GraphUploadTransport = (
  input: GraphUploadTransportInput
) => Promise<GraphUploadTransportResponse>;

export class GraphClient {
  constructor(
    private readonly getAccessToken: AccessTokenProvider,
    private readonly fetchImplementation: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly sleep: Sleep = (milliseconds) =>
      new Promise((resolve) => window.setTimeout(resolve, milliseconds)),
    private readonly uploadTransport: GraphUploadTransport = createXhrUploadTransport()
  ) {}

  async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.response(path, init);
    return (await response.json()) as T;
  }

  async text(path: string, init: RequestInit = {}): Promise<string> {
    const response = await this.response(path, init);
    return response.text();
  }

  async response(path: string, init: RequestInit = {}): Promise<Response> {
    const url = resolveGraphUrl(path);
    let lastError: GraphApiError | null = null;
    let forceRefresh = false;
    let retriedUnauthorized = false;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = await this.getAccessToken(
        forceRefresh ? { forceRefresh: true } : undefined
      );
      forceRefresh = false;
      const headers = new Headers(init.headers);
      headers.set("Authorization", "Bearer " + token);

      const response = await this.fetchImplementation(url, {
        ...init,
        headers
      });

      if (response.ok) {
        return response;
      }

      lastError = await GraphApiError.fromResponse(response);

      if (response.status === 401 && !retriedUnauthorized) {
        retriedUnauthorized = true;
        forceRefresh = true;
        continue;
      }

      if (!RETRYABLE_STATUS.has(response.status) || attempt === 2) {
        throw lastError;
      }

      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfter = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);
      const delay = Number.isFinite(retryAfter)
        ? Math.min(retryAfter * 1000, 5000)
        : Math.min(500 * 2 ** attempt, 5000);
      await this.sleep(delay);
    }

    throw lastError ?? new GraphApiError(500, "unknown", "Microsoft Graph request failed.");
  }

  async uploadJson<T>(
    path: string,
    body: Blob,
    options: {
      headers?: HeadersInit;
      signal?: AbortSignal;
      onProgress?: (progress: GraphUploadProgress) => void;
    } = {}
  ): Promise<T> {
    const url = resolveGraphUrl(path);
    let lastError: GraphApiError | null = null;
    let forceRefresh = false;
    let retriedUnauthorized = false;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      throwIfAborted(options.signal);
      const accessToken = await this.getAccessToken(
        forceRefresh ? { forceRefresh: true } : undefined
      );
      throwIfAborted(options.signal);
      forceRefresh = false;
      const response = await this.uploadTransport({
        url,
        accessToken,
        body,
        headers: new Headers(options.headers),
        signal: options.signal,
        attempt,
        onProgress: options.onProgress
      });

      if (response.status >= 200 && response.status < 300) {
        return JSON.parse(response.responseText) as T;
      }

      lastError = GraphApiError.fromText(response.status, response.responseText);
      if (response.status === 401 && !retriedUnauthorized) {
        retriedUnauthorized = true;
        forceRefresh = true;
        continue;
      }

      if (!RETRYABLE_STATUS.has(response.status) || attempt === 3) {
        throw lastError;
      }

      const retryAfter =
        response.retryAfter === null ? Number.NaN : Number(response.retryAfter);
      const delay = Number.isFinite(retryAfter) && retryAfter >= 0
        ? Math.min(retryAfter * 1000, MAX_UPLOAD_RETRY_DELAY_MS)
        : Math.min(500 * 2 ** (attempt - 1), 5000);
      await sleepWithSignal(this.sleep, delay, options.signal);
    }

    throw lastError ?? new GraphApiError(500, "unknown", "Microsoft Graph upload failed.");
  }
}

function resolveGraphUrl(path: string): string {
  let url: URL;
  try {
    url = new URL(path.startsWith("/") ? GRAPH_ROOT + path : path);
  } catch {
    throw new TypeError("Microsoft Graph URL is invalid.");
  }

  if (
    url.origin !== "https://graph.microsoft.com" ||
    (url.pathname !== "/v1.0" && !url.pathname.startsWith("/v1.0/")) ||
    url.username ||
    url.password
  ) {
    throw new TypeError("Microsoft Graph URL must use the trusted v1.0 endpoint.");
  }

  return url.href;
}

export class GraphApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "GraphApiError";
  }

  static async fromResponse(response: Response): Promise<GraphApiError> {
    let code = "unknown";
    let message = "Microsoft Graph request failed.";

    try {
      const payload = (await response.clone().json()) as {
        error?: { code?: string; message?: string };
      };
      code = payload.error?.code ?? code;
      message = payload.error?.message ?? message;
    } catch {
      const text = await response.text();
      if (text) {
        message = text;
      }
    }

    return new GraphApiError(response.status, code, message);
  }

  static fromText(status: number, text: string): GraphApiError {
    try {
      const payload = JSON.parse(text) as {
        error?: { code?: string; message?: string };
      };
      return new GraphApiError(
        status,
        payload.error?.code ?? "unknown",
        payload.error?.message ?? "Microsoft Graph request failed."
      );
    } catch {
      return new GraphApiError(
        status,
        "unknown",
        text || "Microsoft Graph request failed."
      );
    }
  }
}

export function createXhrUploadTransport(
  createRequest: () => XMLHttpRequest = () => new XMLHttpRequest()
): GraphUploadTransport {
  return ({
    url,
    accessToken,
    body,
    headers,
    signal,
    attempt,
    onProgress
  }) =>
    new Promise((resolve, reject) => {
      throwIfAborted(signal);
      const request = createRequest();
      const abort = () => request.abort();
      const cleanup = () => signal?.removeEventListener("abort", abort);

      request.open("PUT", url, true);
      request.setRequestHeader("Authorization", "Bearer " + accessToken);
      headers.forEach((value, name) => request.setRequestHeader(name, value));
      request.upload.addEventListener("progress", (event) => {
        onProgress?.({
          loadedBytes: event.loaded,
          totalBytes: event.lengthComputable ? event.total : body.size,
          attempt
        });
      });
      request.addEventListener("load", () => {
        cleanup();
        resolve({
          status: request.status,
          responseText: request.responseText,
          retryAfter: request.getResponseHeader("Retry-After")
        });
      });
      request.addEventListener("error", () => {
        cleanup();
        reject(new TypeError("Microsoft Graph upload failed."));
      });
      request.addEventListener("abort", () => {
        cleanup();
        reject(new DOMException("The upload was cancelled.", "AbortError"));
      });
      signal?.addEventListener("abort", abort, { once: true });
      request.send(body);
    });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was cancelled.", "AbortError");
  }
}

async function sleepWithSignal(
  sleep: Sleep,
  milliseconds: number,
  signal: AbortSignal | undefined
): Promise<void> {
  throwIfAborted(signal);
  if (!signal) {
    await sleep(milliseconds);
    return;
  }

  let rejectOnAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectOnAbort = () =>
      reject(new DOMException("The operation was cancelled.", "AbortError"));
    signal.addEventListener("abort", rejectOnAbort, { once: true });
  });

  try {
    await Promise.race([sleep(milliseconds), aborted]);
  } finally {
    if (rejectOnAbort) {
      signal.removeEventListener("abort", rejectOnAbort);
    }
  }
  throwIfAborted(signal);
}
