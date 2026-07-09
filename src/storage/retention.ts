import type { JsonShareStore } from "./store.js";

export type DeleteExpiredJsonSharesResult = {
  checked: number;
  deleted: number;
  failed: number;
  supported: boolean;
};

const dayMs = 24 * 60 * 60 * 1000;

export const jsonShareExpiresAt = (createdAt: Date, retentionDays: number) =>
  new Date(createdAt.getTime() + retentionDays * dayMs);

export const isJsonShareExpired = (createdAt: Date, retentionDays: number, now = new Date()) =>
  now.getTime() >= jsonShareExpiresAt(createdAt, retentionDays).getTime();

export async function deleteExpiredJsonShares(
  store: JsonShareStore,
  retentionDays: number,
  now = new Date(),
): Promise<DeleteExpiredJsonSharesResult> {
  if (!store.listJsonShares || !store.deleteJsonShare) {
    return {
      checked: 0,
      deleted: 0,
      failed: 0,
      supported: false,
    };
  }

  const entries = await store.listJsonShares();
  let deleted = 0;
  let failed = 0;

  for (const entry of entries) {
    if (!isJsonShareExpired(entry.createdAt, retentionDays, now)) {
      continue;
    }

    try {
      await store.deleteJsonShare(entry.jsonId);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    checked: entries.length,
    deleted,
    failed,
    supported: true,
  };
}
