import { useCallback, useEffect, useRef, useState } from "react";
import {
  isRelayDropRefreshDue,
  RELAYDROP_AUTO_REFRESH_LEASE_MS,
  resolveRelayDropSyncPolicy,
  type RelayDropFeedSnapshot,
  type UseRelayDropOptions
} from "../cache/RelayDropFeedCache";
import { createId, sortFeed, upsertFeedItem } from "../domain/feed";
import type {
  RelayDropDevice,
  RelayDropFilePresentation,
  RelayDropItem,
  RelayDropPage
} from "../domain/types";
import {
  IDLE_FILE_TRANSFER,
  type RelayDropFileTransferState
} from "../domain/transfers";
import type { RelayDropDownloadState } from "../downloads/RelayDropDownloadManager";
import {
  RelayDropDeleteError,
  type RelayDropDeleteProgress,
  type RelayDropRepository
} from "../repository/RelayDropRepository";

const PAGE_SIZE = 12;
const PRESENTATION_TTL_MS = 5 * 60 * 1000;
const systemNow = () => Date.now();

export interface RelayDropDeleteFailure {
  id: string;
  step: RelayDropDeleteProgress["step"];
  completedSteps: RelayDropDeleteProgress["completedSteps"];
  message: string;
}

interface FeedState {
  items: RelayDropItem[];
  totalItems: number;
  nextCursor?: string;
  lastRefreshedAt: Date | null;
}

const EMPTY_FEED: FeedState = {
  items: [],
  totalItems: 0,
  lastRefreshedAt: null
};

export function useRelayDrop(
  repository: RelayDropRepository,
  source: RelayDropDevice,
  options: UseRelayDropOptions = {}
) {
  const cache = options.cache;
  const downloadManager = options.downloadManager;
  const now = options.now ?? systemNow;
  const syncPolicy = resolveRelayDropSyncPolicy(options.syncPolicy);
  const [feed, setFeed] = useState<FeedState>(EMPTY_FEED);
  const feedRef = useRef(feed);
  const feedMutationVersion = useRef(0);
  const lifecycleVersion = useRef(0);
  const operationQueue = useRef<Promise<void>>(Promise.resolve());
  const refreshRequest = useRef<Promise<void> | null>(null);
  const loadMoreRequest = useRef<Promise<void> | null>(null);
  const sendRequest = useRef<Promise<void> | null>(null);
  const deleteRequest = useRef<Promise<void> | null>(null);
  const lastAutoRefreshAttempt = useRef<number | null>(null);
  const [isHydrating, setIsHydrating] = useState(Boolean(cache));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteProgress, setDeleteProgress] =
    useState<RelayDropDeleteProgress | null>(null);
  const [deleteFailure, setDeleteFailure] =
    useState<RelayDropDeleteFailure | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadStates, setDownloadStates] = useState<
    Record<string, RelayDropDownloadState>
  >({});
  const [deletingLocalIds, setDeletingLocalIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const deleteLocalRequests = useRef(new Map<string, Promise<void>>());
  const [fileTransfer, setFileTransfer] =
    useState<RelayDropFileTransferState>(IDLE_FILE_TRANSFER);
  const downloadStateRevisions = useRef(new Map<string, number>());
  const [error, setError] = useState<string | null>(null);
  const pendingText = useRef<{
    id: string;
    text: string;
    createdAt: string;
  } | null>(null);
  const pendingFile = useRef<{
    id: string;
    file: File;
    createdAt: string;
  } | null>(null);
  const uploadAbortController = useRef<AbortController | null>(null);
  const presentationCache = useRef(new Map<string, RelayDropFilePresentation>());
  const presentationTimes = useRef(new Map<string, number>());
  const presentationRequests = useRef(
    new Map<string, Promise<RelayDropFilePresentation>>()
  );
  const [presentations, setPresentations] = useState<
    Record<string, RelayDropFilePresentation>
  >({});

  useEffect(() => {
    const currentVersion = lifecycleVersion.current + 1;
    lifecycleVersion.current = currentVersion;
    return () => {
      if (lifecycleVersion.current === currentVersion) {
        lifecycleVersion.current += 1;
      }
      uploadAbortController.current?.abort();
      uploadAbortController.current = null;
    };
  }, []);

  const downloadableItemIds = feed.items
    .filter((item) => item.type === "file" || item.type === "image")
    .map((item) => item.id)
    .join("|");
  const downloadingItemIds = Object.values(downloadStates)
    .filter((state) => state.status === "downloading")
    .map((state) => state.itemId)
    .join("|");

  useEffect(() => {
    if (!downloadManager) return;
    return downloadManager.subscribe((state) => {
      if (!feedRef.current.items.some((item) => item.id === state.itemId)) return;
      markDownloadStateChanged(downloadStateRevisions.current, state.itemId);
      setDownloadStates((current) => ({
        ...current,
        [state.itemId]: state
      }));
    });
  }, [downloadManager]);

  useEffect(() => {
    if (!downloadManager) {
      setDownloadStates({});
      return;
    }
    const itemIds = downloadableItemIds ? downloadableItemIds.split("|") : [];
    const revisionsAtStart = new Map(
      itemIds.map((id) => [id, downloadStateRevisions.current.get(id) ?? 0])
    );
    let active = true;
    void downloadManager
      .getStates(itemIds)
      .then((states) => {
        if (!active) return;
        setDownloadStates((current) =>
          mergeQueriedDownloadStates(
            current,
            states,
            itemIds,
            downloadStateRevisions.current,
            revisionsAtStart
          )
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [downloadManager, downloadableItemIds]);

  useEffect(() => {
    if (
      !downloadManager ||
      !downloadingItemIds ||
      typeof window === "undefined"
    ) {
      return;
    }
    const itemIds = downloadingItemIds.split("|");
    const interval = window.setInterval(() => {
      const revisionsAtStart = new Map(
        itemIds.map((id) => [id, downloadStateRevisions.current.get(id) ?? 0])
      );
      void downloadManager
        .getStates(itemIds)
        .then((states) => {
          setDownloadStates((current) => {
            const untouched = Object.fromEntries(
              Object.entries(current).filter(([id]) => !itemIds.includes(id))
            );
            return {
              ...untouched,
              ...mergeQueriedDownloadStates(
                current,
                states,
                itemIds,
                downloadStateRevisions.current,
                revisionsAtStart
              )
            };
          });
        })
        .catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [downloadManager, downloadingItemIds]);

  const runFeedOperation = useCallback(
    <T,>(operation: () => Promise<T>): Promise<T> => {
      const next = operationQueue.current.then(operation, operation);
      operationQueue.current = next.then(
        () => undefined,
        () => undefined
      );
      return next;
    },
    []
  );

  const commitFeed = useCallback(
    (
      update: FeedState | ((current: FeedState) => FeedState),
      persist = true
    ): FeedState => {
      const next = typeof update === "function" ? update(feedRef.current) : update;
      feedRef.current = next;
      setFeed(next);
      if (persist) {
        feedMutationVersion.current += 1;
        if (cache) {
          void cache.save(toSnapshot(next)).catch(() => undefined);
        }
      }
      return next;
    },
    [cache]
  );

  const refresh = useCallback((): Promise<void> => {
    if (refreshRequest.current) {
      return refreshRequest.current;
    }

    const requestedLifecycleVersion = lifecycleVersion.current;
    const request = runFeedOperation(async () => {
      if (lifecycleVersion.current !== requestedLifecycleVersion) return;
      setIsRefreshing(true);
      setError(null);

      try {
        const feedAtStart = feedRef.current;
        const currentDownloadableIds = feedRef.current.items
          .filter((item) => item.type === "file" || item.type === "image")
          .map((item) => item.id);
        const refreshLocalDownloadStates = (itemIds: string[]) => {
          if (!downloadManager) return;
          const revisionsAtStart = new Map(
            itemIds.map((id) => [id, downloadStateRevisions.current.get(id) ?? 0])
          );
          void downloadManager
            .getStates(itemIds)
            .then((states) => {
              if (lifecycleVersion.current !== requestedLifecycleVersion) return;
              setDownloadStates((current) =>
                mergeQueriedDownloadStates(
                  current,
                  states,
                  itemIds,
                  downloadStateRevisions.current,
                  revisionsAtStart
                )
              );
            })
            .catch(() => undefined);
        };
        refreshLocalDownloadStates(currentDownloadableIds);

        const page = await repository.listItems({
          limit: PAGE_SIZE,
          cachedItems: feedAtStart.items,
          onNewestItem: (item) => {
            if (lifecycleVersion.current === requestedLifecycleVersion) {
              commitFeed(current => commitUpsertedItem(current, item));
            }
          }
        });
        if (lifecycleVersion.current !== requestedLifecycleVersion) return;
        const items = mergeLatestFeed(feedAtStart.items, page.items, Boolean(page.nextCursor), page.observedRange);
        const overlaps = page.items.some(item => feedAtStart.items.some(old => old.id === item.id));
        commitFeed({
          items,
          totalItems: Math.max(page.total, items.length),
          ...(page.nextCursor
            ? { nextCursor: overlaps ? feedAtStart.nextCursor : page.nextCursor }
            : {}),
          lastRefreshedAt: new Date(now())
        });
        const refreshedDownloadableIds = page.items
          .filter((item) => item.type === "file" || item.type === "image")
          .map((item) => item.id);
        if (refreshedDownloadableIds.join("|") !== currentDownloadableIds.join("|")) {
          refreshLocalDownloadStates(refreshedDownloadableIds);
        }
        const changed = new Set(page.items.filter(item => {
          const previous = feedAtStart.items.find(old => old.id === item.id);
          return !previous || previous.cloudVersion?.eTag !== item.cloudVersion?.eTag;
        }).map(item => item.id));
        for (const id of presentationCache.current.keys()) {
          if (changed.has(id) || !items.some(item => item.id === id) ||
            now() - (presentationTimes.current.get(id) ?? 0) >= PRESENTATION_TTL_MS) {
            presentationCache.current.delete(id);
            presentationTimes.current.delete(id);
          }
        }
        setPresentations(current => Object.fromEntries(Object.entries(current).filter(([id]) => presentationCache.current.has(id))));
      } catch (caught) {
        if (lifecycleVersion.current !== requestedLifecycleVersion) return;
        setError(
          errorMessage(caught, "RelayDrop could not refresh the feed. Please try again.")
        );
      } finally {
        if (lifecycleVersion.current === requestedLifecycleVersion) {
          setIsRefreshing(false);
        }
      }
    });

    refreshRequest.current = request;
    void request.finally(() => {
      if (refreshRequest.current === request) {
        refreshRequest.current = null;
      }
    });
    return request;
  }, [commitFeed, downloadManager, now, repository, runFeedOperation]);

  const autoRefreshIfDue = useCallback(
    async (minimumIntervalMs: number): Promise<void> => {
      const attemptAt = now();
      if (
        !isRelayDropRefreshDue(
          feedRef.current.lastRefreshedAt,
          minimumIntervalMs,
          attemptAt
        ) ||
        (lastAutoRefreshAttempt.current !== null &&
          attemptAt - lastAutoRefreshAttempt.current >= 0 &&
          attemptAt - lastAutoRefreshAttempt.current <
            RELAYDROP_AUTO_REFRESH_LEASE_MS)
      ) {
        return;
      }

      lastAutoRefreshAttempt.current = attemptAt;
      if (cache) {
        try {
          if (
            !(await cache.tryBeginAutoRefresh(minimumIntervalMs, attemptAt))
          ) {
            return;
          }
        } catch {
          // Fall back to the in-memory gate if extension storage is unavailable.
        }
      }
      await refresh();
    },
    [cache, now, refresh]
  );

  useEffect(() => {
    let active = true;
    const mutationVersionAtStart = feedMutationVersion.current;

    const hydrate = async () => {
      let snapshot: RelayDropFeedSnapshot | null = null;
      if (cache) {
        try {
          snapshot = await cache.load();
        } catch {
          // The local cache is an optional fast path; OneDrive remains the source of truth.
        }
      }
      if (!active) {
        return;
      }

      if (snapshot && feedMutationVersion.current === mutationVersionAtStart) {
        commitFeed(fromSnapshot(snapshot), false);
      }
      setIsHydrating(false);
    };

    void hydrate();
    return () => {
      active = false;
    };
  }, [cache, commitFeed]);

  useEffect(() => {
    if (isHydrating || !syncPolicy.refreshOnOpen) {
      return;
    }
    let active = true;
    let retryTimer: number | undefined;
    const runOpenRefresh = async () => {
      await autoRefreshIfDue(syncPolicy.openCooldownMs);
      if (!active || typeof window === "undefined") return;
      retryTimer = window.setTimeout(() => {
        void (async () => {
          if (!active) return;
          const mutationVersionAtLoad = feedMutationVersion.current;
          if (cache) {
            try {
              const snapshot = await cache.load();
              if (
                active &&
                snapshot &&
                feedMutationVersion.current === mutationVersionAtLoad &&
                isSnapshotNewer(snapshot, feedRef.current)
              ) {
                commitFeed(fromSnapshot(snapshot), false);
                setError(null);
              }
            } catch {
              // A missed cache handoff still falls through to a bounded retry.
            }
          }
          if (active && document.visibilityState === "visible") {
            void autoRefreshIfDue(syncPolicy.openCooldownMs);
          }
        })();
      }, RELAYDROP_AUTO_REFRESH_LEASE_MS + 250);
    };
    void runOpenRefresh();
    return () => {
      active = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [
    autoRefreshIfDue,
    cache,
    commitFeed,
    isHydrating,
    syncPolicy.openCooldownMs,
    syncPolicy.refreshOnOpen
  ]);

  useEffect(() => {
    if (
      !syncPolicy.refreshWhileOpen ||
      typeof document === "undefined" ||
      typeof window === "undefined"
    ) {
      return;
    }

    const refreshIfDue = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void autoRefreshIfDue(syncPolicy.openCooldownMs);
    };
    const interval = window.setInterval(
      refreshIfDue,
      syncPolicy.visibleRefreshIntervalMs
    );
    document.addEventListener("visibilitychange", refreshIfDue);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfDue);
    };
  }, [
    autoRefreshIfDue,
    syncPolicy.refreshWhileOpen,
    syncPolicy.openCooldownMs,
    syncPolicy.visibleRefreshIntervalMs
  ]);

  const loadMore = useCallback((): Promise<void> => {
    if (!feedRef.current.nextCursor || loadMoreRequest.current) {
      return Promise.resolve();
    }

    const requestedLifecycleVersion = lifecycleVersion.current;
    const request = runFeedOperation(async () => {
      if (lifecycleVersion.current !== requestedLifecycleVersion) return;
      const cursor = feedRef.current.nextCursor;
      if (!cursor) return;

      setIsLoadingMore(true);
      setError(null);
      try {
        const page = await repository.listItems({ cursor, limit: PAGE_SIZE, cachedItems: feedRef.current.items });
        if (lifecycleVersion.current !== requestedLifecycleVersion) return;
        commitFeed((current) => {
          if (current.nextCursor !== cursor) return current;
          const retained = current.items.filter(item => shouldKeepCachedItem(item, page.observedRange));
          const known = new Set(retained.map((item) => item.id));
          const items = sortFeed([
            ...retained,
            ...page.items.filter((item) => !known.has(item.id))
          ]);
          return {
            ...current,
            items,
            totalItems: Math.max(page.total, items.length),
            ...(page.nextCursor
              ? { nextCursor: page.nextCursor }
              : { nextCursor: undefined })
          };
        });
      } catch (caught) {
        if (lifecycleVersion.current !== requestedLifecycleVersion) return;
        setError(errorMessage(caught, "RelayDrop could not load older items."));
      } finally {
        if (lifecycleVersion.current === requestedLifecycleVersion) {
          setIsLoadingMore(false);
        }
      }
    });

    loadMoreRequest.current = request;
    void request.finally(() => {
      if (loadMoreRequest.current === request) {
        loadMoreRequest.current = null;
      }
    });
    return request;
  }, [commitFeed, repository, runFeedOperation]);

  const finishSendRequest = useCallback(
    (request: Promise<void>, requestedLifecycleVersion: number) => {
      if (sendRequest.current === request) sendRequest.current = null;
      if (lifecycleVersion.current === requestedLifecycleVersion) {
        setIsSending(false);
      }
    },
    []
  );

  const finishDeleteRequest = useCallback(
    (request: Promise<void>, requestedLifecycleVersion: number) => {
      if (deleteRequest.current === request) deleteRequest.current = null;
      if (lifecycleVersion.current === requestedLifecycleVersion) {
        setDeletingId(null);
      }
    },
    []
  );

  const sendText = useCallback(
    (text: string) => {
      if (sendRequest.current) return sendRequest.current;
      const requestedLifecycleVersion = lifecycleVersion.current;
      setIsSending(true);
      setError(null);
      const request = runFeedOperation(async () => {
        if (lifecycleVersion.current !== requestedLifecycleVersion) return;

        try {
          const request =
            pendingText.current?.text === text
              ? pendingText.current
              : {
                  id: createId(),
                  text,
                  createdAt: new Date(now()).toISOString()
                };
          pendingText.current = request;
          const item = await repository.createText({
            id: request.id,
            text,
            source,
            createdAt: request.createdAt
          });
          if (lifecycleVersion.current !== requestedLifecycleVersion) return;
          commitFeed((current) => commitUpsertedItem(current, item));
          pendingText.current = null;
        } catch (caught) {
          if (lifecycleVersion.current !== requestedLifecycleVersion) return;
          setError(
            errorMessage(caught, "That note could not be sent. Your draft is still here.")
          );
          throw new Error("send-text-failed");
        }
      });
      sendRequest.current = request;
      void request.then(
        () => finishSendRequest(request, requestedLifecycleVersion),
        () => finishSendRequest(request, requestedLifecycleVersion)
      );
      return request;
    },
    [commitFeed, finishSendRequest, now, repository, runFeedOperation, source]
  );

  const sendFile = useCallback(
    (file: File) => {
      if (sendRequest.current) return sendRequest.current;
      const requestedLifecycleVersion = lifecycleVersion.current;
      const mutation =
        pendingFile.current?.file === file
          ? pendingFile.current
          : {
              id: createId(),
              file,
              createdAt: new Date(now()).toISOString()
            };
      pendingFile.current = mutation;
      const controller = new AbortController();
      uploadAbortController.current = controller;
      setIsSending(true);
      setError(null);
      setFileTransfer({ status: "preparing", fileName: file.name });
      const request = runFeedOperation(async () => {
        if (lifecycleVersion.current !== requestedLifecycleVersion) return;

        try {
          throwIfSignalAborted(controller.signal);
          const item = await repository.createFile(
            {
              id: mutation.id,
              file,
              source,
              createdAt: mutation.createdAt
            },
            {
              signal: controller.signal,
              onProgress: (progress) => {
                if (lifecycleVersion.current !== requestedLifecycleVersion) return;
                const percent =
                  progress.phase === "uploading" && progress.totalBytes
                    ? Math.min(
                        100,
                        Math.max(
                          0,
                          Math.round(
                            (progress.loadedBytes ?? 0) / progress.totalBytes * 100
                          )
                        )
                      )
                    : undefined;
                setFileTransfer({
                  status: progress.phase,
                  fileName: file.name,
                  ...(progress.loadedBytes !== undefined
                    ? { loadedBytes: progress.loadedBytes }
                    : {}),
                  ...(progress.totalBytes !== undefined
                    ? { totalBytes: progress.totalBytes }
                    : {}),
                  ...(progress.attempt !== undefined
                    ? { attempt: progress.attempt }
                    : {}),
                  ...(percent !== undefined ? { percent } : {})
                });
              }
            }
          );
          if (lifecycleVersion.current !== requestedLifecycleVersion) return;
          commitFeed((current) => commitUpsertedItem(current, item));
          pendingFile.current = null;
          setFileTransfer({
            status: "success",
            fileName: file.name,
            loadedBytes: file.size,
            totalBytes: file.size,
            percent: 100
          });
        } catch (caught) {
          if (lifecycleVersion.current !== requestedLifecycleVersion) return;
          if (isAbortError(caught)) {
            setFileTransfer((current) => ({
              ...current,
              status: "cancelled",
              fileName: file.name,
              message: "Upload stopped. Retry will safely check OneDrive before continuing."
            }));
            setError(null);
          } else {
            const message = errorMessage(
              caught,
              "That file could not be sent. Please try it again."
            );
            setFileTransfer({ status: "failed", fileName: file.name, message });
            setError(message);
            if (caught instanceof Error && caught.name === "RelayDropConflictError") {
              pendingFile.current = null;
            }
          }
          throw new Error("send-file-failed");
        } finally {
          if (uploadAbortController.current === controller) {
            uploadAbortController.current = null;
          }
        }
      });
      sendRequest.current = request;
      void request.then(
        () => finishSendRequest(request, requestedLifecycleVersion),
        () => finishSendRequest(request, requestedLifecycleVersion)
      );
      return request;
    },
    [commitFeed, finishSendRequest, now, repository, runFeedOperation, source]
  );

  const cancelFileUpload = useCallback(() => {
    if (!uploadAbortController.current) return;
    setFileTransfer((current) => ({ ...current, status: "cancelling" }));
    uploadAbortController.current.abort();
  }, []);

  const resetFileTransfer = useCallback(() => {
    if (sendRequest.current) return;
    pendingFile.current = null;
    setFileTransfer(IDLE_FILE_TRANSFER);
  }, []);

  const deleteItem = useCallback(
    (id: string) => {
      if (deleteRequest.current) return deleteRequest.current;
      const requestedLifecycleVersion = lifecycleVersion.current;
      setDeletingId(id);
      setDeleteProgress(null);
      setDeleteFailure(null);
      setError(null);
      const request = runFeedOperation(async () => {
        if (lifecycleVersion.current !== requestedLifecycleVersion) return;

        try {
          await repository.deleteItem(id, {
            onProgress: (progress) => {
              if (lifecycleVersion.current === requestedLifecycleVersion) {
                setDeleteProgress(progress);
              }
            }
          });
          if (lifecycleVersion.current !== requestedLifecycleVersion) return;
          commitFeed((current) => ({
            ...current,
            items: current.items.filter((item) => item.id !== id),
            totalItems: Math.max(0, current.totalItems - 1)
          }));
          presentationCache.current.delete(id);
          setPresentations((current) => {
            const remaining = { ...current };
            delete remaining[id];
            return remaining;
          });
          setDeleteProgress(null);
          setDeleteFailure(null);
        } catch (caught) {
          if (lifecycleVersion.current !== requestedLifecycleVersion) return;
          const message = errorMessage(
            caught,
            "RelayDrop could not delete that item. Nothing else was changed."
          );
          if (caught instanceof RelayDropDeleteError) {
            setDeleteFailure({
              id,
              step: caught.step,
              completedSteps: caught.completedSteps,
              message
            });
          }
          setError(message);
          throw new Error("delete-failed");
        }
      });
      deleteRequest.current = request;
      void request.then(
        () => finishDeleteRequest(request, requestedLifecycleVersion),
        () => finishDeleteRequest(request, requestedLifecycleVersion)
      );
      return request;
    },
    [commitFeed, finishDeleteRequest, repository, runFeedOperation]
  );

  const downloadItem = useCallback(
    async (item: RelayDropItem) => {
      if (item.type !== "file" && item.type !== "image") {
        return;
      }

      setDownloadingId(item.id);
      setError(null);

      try {
        if (downloadManager) {
          const state = await downloadManager.download({
            itemId: item.id,
            fileName: item.file.name,
            loadBlob: () => repository.downloadFile(item.id),
            onStateChange: (next) => {
              markDownloadStateChanged(downloadStateRevisions.current, item.id);
              setDownloadStates((current) => ({ ...current, [item.id]: next }));
            }
          });
          markDownloadStateChanged(downloadStateRevisions.current, item.id);
          setDownloadStates((current) => ({ ...current, [item.id]: state }));
        } else {
          const blob = await repository.downloadFile(item.id);
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = item.file.name;
          document.body.append(anchor);
          anchor.click();
          anchor.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      } catch (caught) {
        setError(errorMessage(caught, "RelayDrop could not download that file."));
        throw new Error("download-failed");
      } finally {
        setDownloadingId(null);
      }
    },
    [downloadManager, repository]
  );

  const openDownloadedItem = useCallback(
    async (id: string) => {
      if (!downloadManager) return;
      setError(null);
      try {
        await downloadManager.open(id);
      } catch (caught) {
        setError(errorMessage(caught, "The downloaded file could not be opened."));
        const states = await downloadManager.getStates([id]).catch(() => ({}));
        setDownloadStates((current) => ({ ...current, ...states }));
      }
    },
    [downloadManager]
  );

  const showDownloadedItem = useCallback(
    async (id: string) => {
      if (!downloadManager) return;
      setError(null);
      try {
        await downloadManager.show(id);
      } catch (caught) {
        setError(errorMessage(caught, "The downloaded file could not be found."));
        const states = await downloadManager.getStates([id]).catch(() => ({}));
        setDownloadStates((current) => ({ ...current, ...states }));
      }
    },
    [downloadManager]
  );

  const deleteDownloadedItem = useCallback(
    (id: string) => {
      if (!downloadManager) return Promise.resolve();
      const existing = deleteLocalRequests.current.get(id);
      if (existing) return existing;

      setDeletingLocalIds((current) => new Set(current).add(id));
      setError(null);
      const request = (async () => {
        try {
          const state = await downloadManager.deleteLocal(id);
          markDownloadStateChanged(downloadStateRevisions.current, id);
          setDownloadStates((current) => ({ ...current, [id]: state }));
        } catch (caught) {
          setError(errorMessage(caught, "The local copy could not be deleted."));
        } finally {
          deleteLocalRequests.current.delete(id);
          setDeletingLocalIds((current) => {
            const next = new Set(current);
            next.delete(id);
            return next;
          });
        }
      })();
      deleteLocalRequests.current.set(id, request);
      return request;
    },
    [downloadManager]
  );

  const loadFilePresentation = useCallback(
    async (id: string) => {
      const cached = presentationCache.current.get(id);
      if (cached && now() - (presentationTimes.current.get(id) ?? 0) < PRESENTATION_TTL_MS) {
        return cached;
      }

      const pending = presentationRequests.current.get(id);
      if (pending) {
        return pending;
      }

      const request = repository
        .getFilePresentation(id, { refresh: true })
        .then((presentation) => {
          presentationCache.current.set(id, presentation);
          presentationTimes.current.set(id, now());
          setPresentations((current) => ({ ...current, [id]: presentation }));
          return presentation;
        })
        .finally(() => presentationRequests.current.delete(id));
      presentationRequests.current.set(id, request);
      return request;
    },
    [now, repository]
  );

  return {
    items: feed.items,
    totalItems: feed.totalItems,
    hasMore: Boolean(feed.nextCursor),
    lastRefreshedAt: feed.lastRefreshedAt,
    isHydrating,
    isRefreshing,
    isLoadingMore,
    isSending,
    deletingId,
    deleteProgress,
    deleteFailure,
    downloadingId,
    deletingLocalIds,
    downloadStates,
    fileTransfer,
    error,
    presentations,
    refresh,
    loadMore,
    sendText,
    sendFile,
    cancelFileUpload,
    resetFileTransfer,
    loadFilePresentation,
    downloadItem,
    openDownloadedItem,
    showDownloadedItem,
    deleteDownloadedItem,
    deleteItem,
    clearDeleteFailure: () => setDeleteFailure(null),
    reportError: (message: string) => setError(message),
    clearError: () => setError(null)
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function throwIfSignalAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("The upload was cancelled.", "AbortError");
  }
}

function commitUpsertedItem(current: FeedState, item: RelayDropItem): FeedState {
  const result = upsertFeedItem(current.items, item);
  return {
    ...current,
    items: result.items,
    totalItems: result.inserted ? current.totalItems + 1 : current.totalItems
  };
}

export function mergeLatestFeed(
  previous: RelayDropItem[], newest: RelayDropItem[], hasOlder: boolean,
  range?: RelayDropPage["observedRange"]
): RelayDropItem[] {
  const head = sortFeed(newest);
  if (!hasOlder) return head;
  const boundary = head.at(-1);
  if (!boundary) return previous;
  const ids = new Set(head.map(item => item.id));
  const older = previous.filter(item => {
    if (ids.has(item.id) || sortFeed([boundary, item])[0] !== boundary) return false;
    return shouldKeepCachedItem(item, range);
  });
  return sortFeed([...head, ...older]);
}

function shouldKeepCachedItem(item: RelayDropItem, range?: RelayDropPage["observedRange"]): boolean {
  if (!range || range.itemIds.includes(item.id)) return true;
  if (range.complete) return false;
  const oldest = range.oldest;
  if (!oldest) return true;
  const age = Date.parse(item.serverUpdatedAt ?? item.serverCreatedAt) - Date.parse(oldest.timestamp);
  return age < 0 || (age === 0 && item.id.localeCompare(oldest.id) > 0);
}

function markDownloadStateChanged(revisions: Map<string, number>, id: string): void {
  revisions.set(id, (revisions.get(id) ?? 0) + 1);
}

export function mergeQueriedDownloadStates(
  current: Record<string, RelayDropDownloadState>,
  queried: Record<string, RelayDropDownloadState>,
  itemIds: string[],
  revisions: Map<string, number>,
  revisionsAtStart: Map<string, number>
): Record<string, RelayDropDownloadState> {
  const next: Record<string, RelayDropDownloadState> = {};
  for (const id of itemIds) {
    const changedDuringRequest =
      (revisions.get(id) ?? 0) !== (revisionsAtStart.get(id) ?? 0);
    const state = changedDuringRequest ? current[id] : queried[id];
    if (state) next[id] = state;
  }
  return next;
}

function toSnapshot(feed: FeedState): RelayDropFeedSnapshot {
  return {
    items: feed.items,
    totalItems: feed.totalItems,
    ...(feed.nextCursor ? { nextCursor: feed.nextCursor } : {}),
    lastRefreshedAt: feed.lastRefreshedAt?.toISOString() ?? null
  };
}

function fromSnapshot(snapshot: RelayDropFeedSnapshot): FeedState {
  return {
    items: sortFeed(snapshot.items),
    totalItems: snapshot.totalItems,
    ...(snapshot.nextCursor ? { nextCursor: snapshot.nextCursor } : {}),
    lastRefreshedAt: snapshot.lastRefreshedAt
      ? new Date(snapshot.lastRefreshedAt)
      : null
  };
}

function isSnapshotNewer(snapshot: RelayDropFeedSnapshot, current: FeedState): boolean {
  const snapshotTime = snapshot.lastRefreshedAt
    ? Date.parse(snapshot.lastRefreshedAt)
    : Number.NEGATIVE_INFINITY;
  const currentTime = current.lastRefreshedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  return (
    snapshotTime > currentTime ||
    (current.lastRefreshedAt === null &&
      current.items.length === 0 &&
      snapshot.items.length > 0)
  );
}

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}
