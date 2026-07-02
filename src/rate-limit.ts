export class RateLimitError extends Error {
  readonly statusCode = 429;

  constructor() {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
  }
}

type Bucket = {
  count: number;
  startedAt: number;
};

export type RateLimiter = {
  assertAllowed(key: string): void;
  bucketCount(): number;
};

export function createRateLimiter({
  limit,
  windowMs = 60_000,
  now = () => Date.now(),
}: {
  limit: number;
  windowMs?: number;
  now?: () => number;
}): RateLimiter {
  const buckets = new Map<string, Bucket>();
  let lastPrunedAt = 0;

  return {
    assertAllowed(key) {
      if (!Number.isFinite(limit) || limit <= 0) {
        return;
      }

      const timestamp = now();
      if (timestamp - lastPrunedAt >= windowMs) {
        pruneExpiredBuckets(buckets, timestamp, windowMs);
        lastPrunedAt = timestamp;
      }

      const bucket = buckets.get(key);
      if (!bucket || timestamp - bucket.startedAt >= windowMs) {
        buckets.set(key, { count: 1, startedAt: timestamp });
        return;
      }

      bucket.count += 1;
      if (bucket.count > limit) {
        throw new RateLimitError();
      }
    },
    bucketCount() {
      return buckets.size;
    },
  };
}

function pruneExpiredBuckets(buckets: Map<string, Bucket>, timestamp: number, windowMs: number) {
  for (const [key, bucket] of buckets) {
    if (timestamp - bucket.startedAt >= windowMs) {
      buckets.delete(key);
    }
  }
}
