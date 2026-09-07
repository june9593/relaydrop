import { describe, expect, it, vi } from "vitest";
import {
  GraphClient,
  createXhrUploadTransport,
  type GraphUploadTransport
} from "./GraphClient";

describe("GraphClient", () => {
  it("adds a bearer token and returns JSON", async () => {
    const fetchImplementation = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer access-token");
      return new Response(JSON.stringify({ value: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch;
    const client = new GraphClient(async () => "access-token", fetchImplementation);

    await expect(client.json("/me/drive")).resolves.toEqual({ value: 1 });
  });

  it("rejects a non-Graph absolute URL before requesting a token", async () => {
    const getAccessToken = vi.fn(async () => "access-token");
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    const client = new GraphClient(getAccessToken, fetchImplementation);

    await expect(client.response("https://attacker.example/collect")).rejects.toThrow(
      "Microsoft Graph URL"
    );
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("accepts an absolute Microsoft Graph pagination URL", async () => {
    const fetchImplementation = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
    const client = new GraphClient(async () => "access-token", fetchImplementation);
    const nextLink = "https://graph.microsoft.com/v1.0/me/drive/root/children?$skiptoken=next";

    await client.response(nextLink);

    expect(fetchImplementation).toHaveBeenCalledWith(
      nextLink,
      expect.objectContaining({ headers: expect.any(Headers) })
    );
  });

  it("rejects a relative path that escapes the Graph v1.0 namespace", async () => {
    const getAccessToken = vi.fn(async () => "access-token");
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    const client = new GraphClient(getAccessToken, fetchImplementation);

    await expect(client.response("/../beta/me/drive")).rejects.toThrow(
      "Microsoft Graph URL"
    );
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("retries throttled requests", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "throttledRequest" } }), {
          status: 429,
          headers: { "Retry-After": "0" }
        })
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 })) as typeof fetch;
    const sleep = vi.fn(async () => undefined);
    const client = new GraphClient(async () => "token", fetchImplementation, sleep);

    await client.json("/me/drive");

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("backs off when a retryable fetch response omits Retry-After", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "serviceUnavailable" } }), {
          status: 503
        })
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 })) as typeof fetch;
    const sleep = vi.fn(async () => undefined);
    const client = new GraphClient(async () => "token", fetchImplementation, sleep);

    await client.json("/me/drive");

    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("forces one token refresh after an unauthorized response", async () => {
    const getAccessToken = vi
      .fn()
      .mockResolvedValueOnce("expired-token")
      .mockResolvedValueOnce("fresh-token");
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "InvalidAuthenticationToken" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 })) as typeof fetch;
    const client = new GraphClient(getAccessToken, fetchImplementation);

    await client.json("/me/drive");

    expect(getAccessToken).toHaveBeenNthCalledWith(1, undefined);
    expect(getAccessToken).toHaveBeenNthCalledWith(2, { forceRefresh: true });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("surfaces Graph error details", async () => {
    const fetchImplementation = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: "quotaLimitReached", message: "Drive is full." } }),
          { status: 507, headers: { "Content-Type": "application/json" } }
        )
    ) as typeof fetch;
    const client = new GraphClient(async () => "token", fetchImplementation);

    await expect(client.json("/me/drive")).rejects.toMatchObject({
      status: 507,
      code: "quotaLimitReached",
      message: "Drive is full."
    });
  });

  it("uploads a blob with progress and parses the Graph response", async () => {
    const progress = vi.fn();
    const uploadTransport: GraphUploadTransport = vi.fn(async (input) => {
      expect(input.accessToken).toBe("upload-token");
      expect(input.headers.get("Content-Type")).toBe("text/plain");
      input.onProgress?.({ loadedBytes: 4, totalBytes: 8, attempt: input.attempt });
      return {
        status: 201,
        responseText: JSON.stringify({ id: "uploaded-item" }),
        retryAfter: null
      };
    });
    const client = new GraphClient(
      async () => "upload-token",
      globalThis.fetch,
      async () => undefined,
      uploadTransport
    );

    await expect(
      client.uploadJson("/me/drive/items/root:/file.txt:/content", new Blob(["content"]), {
        headers: { "Content-Type": "text/plain" },
        onProgress: progress
      })
    ).resolves.toEqual({ id: "uploaded-item" });
    expect(progress).toHaveBeenCalledWith({
      loadedBytes: 4,
      totalBytes: 8,
      attempt: 1
    });
  });

  it("rejects a non-Graph upload URL before requesting a token", async () => {
    const getAccessToken = vi.fn(async () => "upload-token");
    const uploadTransport = vi.fn<GraphUploadTransport>();
    const client = new GraphClient(
      getAccessToken,
      globalThis.fetch,
      async () => undefined,
      uploadTransport
    );

    await expect(
      client.uploadJson("https://attacker.example/upload", new Blob(["content"]))
    ).rejects.toThrow("Microsoft Graph URL");
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(uploadTransport).not.toHaveBeenCalled();
  });

  it("uses exponential backoff when Retry-After is absent", async () => {
    const uploadTransport = vi
      .fn<GraphUploadTransport>()
      .mockResolvedValueOnce({
        status: 503,
        responseText: JSON.stringify({ error: { code: "serviceUnavailable" } }),
        retryAfter: null
      })
      .mockResolvedValueOnce({
        status: 200,
        responseText: JSON.stringify({ id: "uploaded-item" }),
        retryAfter: null
      });
    const sleep = vi.fn(async () => undefined);
    const client = new GraphClient(
      async () => "token",
      globalThis.fetch,
      sleep,
      uploadTransport
    );

    await client.uploadJson("/upload", new Blob(["content"]));

    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("honors the full upload Retry-After delay from Graph", async () => {
    const uploadTransport = vi
      .fn<GraphUploadTransport>()
      .mockResolvedValueOnce({
        status: 429,
        responseText: JSON.stringify({ error: { code: "throttledRequest" } }),
        retryAfter: "30"
      })
      .mockResolvedValueOnce({
        status: 200,
        responseText: JSON.stringify({ id: "uploaded-item" }),
        retryAfter: null
      });
    const sleep = vi.fn(async () => undefined);
    const client = new GraphClient(
      async () => "token",
      globalThis.fetch,
      sleep,
      uploadTransport
    );

    await client.uploadJson("/upload", new Blob(["content"]));

    expect(sleep).toHaveBeenCalledWith(30_000);
  });

  it("caps an excessive upload Retry-After delay", async () => {
    const uploadTransport = vi
      .fn<GraphUploadTransport>()
      .mockResolvedValueOnce({
        status: 429,
        responseText: JSON.stringify({ error: { code: "throttledRequest" } }),
        retryAfter: "31536000"
      })
      .mockResolvedValueOnce({
        status: 200,
        responseText: JSON.stringify({ id: "uploaded-item" }),
        retryAfter: null
      });
    const sleep = vi.fn(async () => undefined);
    const client = new GraphClient(
      async () => "token",
      globalThis.fetch,
      sleep,
      uploadTransport
    );

    await client.uploadJson("/upload", new Blob(["content"]));

    expect(sleep).toHaveBeenCalledWith(30_000);
  });

  it("cancels an upload while waiting to retry", async () => {
    const uploadTransport = vi.fn<GraphUploadTransport>().mockResolvedValueOnce({
      status: 503,
      responseText: JSON.stringify({ error: { code: "serviceUnavailable" } }),
      retryAfter: "30"
    });
    const sleep = vi.fn(() => new Promise<void>(() => undefined));
    const controller = new AbortController();
    const client = new GraphClient(
      async () => "token",
      globalThis.fetch,
      sleep,
      uploadTransport
    );
    const pending = client.uploadJson("/upload", new Blob(["content"]), {
      signal: controller.signal
    });
    await vi.waitFor(() => expect(sleep).toHaveBeenCalledWith(30_000));

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(uploadTransport).toHaveBeenCalledTimes(1);
  });

  it("forces one fresh token when an upload is unauthorized", async () => {
    const getAccessToken = vi
      .fn()
      .mockResolvedValueOnce("expired-token")
      .mockResolvedValueOnce("fresh-token");
    const uploadTransport = vi
      .fn<GraphUploadTransport>()
      .mockResolvedValueOnce({
        status: 401,
        responseText: JSON.stringify({ error: { code: "InvalidAuthenticationToken" } }),
        retryAfter: null
      })
      .mockResolvedValueOnce({
        status: 200,
        responseText: JSON.stringify({ id: "uploaded-item" }),
        retryAfter: null
      });
    const client = new GraphClient(
      getAccessToken,
      globalThis.fetch,
      async () => undefined,
      uploadTransport
    );

    await client.uploadJson("/upload", new Blob(["content"]));

    expect(getAccessToken).toHaveBeenNthCalledWith(1, undefined);
    expect(getAccessToken).toHaveBeenNthCalledWith(2, { forceRefresh: true });
  });

  it("aborts an XHR upload through AbortSignal", async () => {
    const request = new FakeUploadRequest();
    const transport = createXhrUploadTransport(
      () => request as unknown as XMLHttpRequest
    );
    const controller = new AbortController();
    const pending = transport({
      url: "https://graph.microsoft.com/v1.0/upload",
      accessToken: "token",
      body: new Blob(["content"]),
      headers: new Headers(),
      signal: controller.signal,
      attempt: 1
    });

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(request.abort).toHaveBeenCalledTimes(1);
  });

  it("forwards native XHR upload progress", async () => {
    const request = new FakeUploadRequest();
    const progress = vi.fn();
    request.send.mockImplementationOnce(() => {
      const event = Object.assign(new Event("progress"), {
        loaded: 6,
        total: 10,
        lengthComputable: true
      });
      request.upload.dispatchEvent(event);
      request.status = 201;
      request.responseText = JSON.stringify({ id: "uploaded-item" });
      request.dispatchEvent(new Event("load"));
    });
    const transport = createXhrUploadTransport(
      () => request as unknown as XMLHttpRequest
    );

    await expect(
      transport({
        url: "https://graph.microsoft.com/v1.0/upload",
        accessToken: "token",
        body: new Blob(["content"]),
        headers: new Headers(),
        attempt: 2,
        onProgress: progress
      })
    ).resolves.toMatchObject({ status: 201 });
    expect(progress).toHaveBeenCalledWith({
      loadedBytes: 6,
      totalBytes: 10,
      attempt: 2
    });
  });
});

class FakeUploadRequest extends EventTarget {
  readonly upload = new EventTarget();
  readonly abort = vi.fn(() => this.dispatchEvent(new Event("abort")));
  readonly open = vi.fn();
  readonly setRequestHeader = vi.fn();
  readonly send = vi.fn();
  status = 0;
  responseText = "";

  getResponseHeader() {
    return null;
  }
}
