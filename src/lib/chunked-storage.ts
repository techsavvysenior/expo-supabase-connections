/**
 * Stores long values in a key-value store that limits the size of each value.
 *
 * The Keychain and Keystore (through expo-secure-store) hold about 2 KB per
 * entry, and a Supabase session is larger than that. This splits a value
 * across numbered entries and keeps a count beside them.
 */
export type KeyValueStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

export type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const DEFAULT_CHUNK_SIZE = 1800;

export function createChunkedStorage(
  store: KeyValueStore,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): AsyncStorageLike {
  const countKey = (key: string) => `${key}.count`;
  const chunkKey = (key: string, index: number) => `${key}.${index}`;

  async function readCount(key: string): Promise<number> {
    const count = Number(await store.getItemAsync(countKey(key)));
    return Number.isInteger(count) && count > 0 ? count : 0;
  }

  async function deleteChunks(key: string, from: number, to: number): Promise<void> {
    const deletions: Promise<void>[] = [];
    for (let index = from; index < to; index++) {
      deletions.push(store.deleteItemAsync(chunkKey(key, index)));
    }
    await Promise.all(deletions);
  }

  return {
    async getItem(key) {
      const count = await readCount(key);
      if (count === 0) return null;

      const chunks = await Promise.all(
        Array.from({ length: count }, (_, index) => store.getItemAsync(chunkKey(key, index))),
      );
      // A missing piece means a write was interrupted. Treat it as signed out
      // instead of handing back half a session.
      if (chunks.some((chunk) => chunk === null)) return null;
      return chunks.join('');
    },

    async setItem(key, value) {
      const previousCount = await readCount(key);
      const chunks: string[] = [];
      for (let offset = 0; offset < value.length; offset += chunkSize) {
        chunks.push(value.slice(offset, offset + chunkSize));
      }

      await Promise.all(
        chunks.map((chunk, index) => store.setItemAsync(chunkKey(key, index), chunk)),
      );
      await store.setItemAsync(countKey(key), String(chunks.length));
      await deleteChunks(key, chunks.length, previousCount);
    },

    async removeItem(key) {
      const count = await readCount(key);
      await store.deleteItemAsync(countKey(key));
      await deleteChunks(key, 0, count);
    },
  };
}
