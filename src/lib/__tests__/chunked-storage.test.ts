import { createChunkedStorage, type KeyValueStore } from '@/lib/chunked-storage';

/** An in-memory stand-in for expo-secure-store with the same size limit. */
function createLimitedStore(limit: number) {
  const entries = new Map<string, string>();
  const store: KeyValueStore = {
    getItemAsync: async (key) => entries.get(key) ?? null,
    setItemAsync: async (key, value) => {
      if (value.length > limit) throw new Error('Value too large');
      entries.set(key, value);
    },
    deleteItemAsync: async (key) => {
      entries.delete(key);
    },
  };
  return { store, entries };
}

const KEY = 'sb-project-auth-token';

describe('chunked storage', () => {
  it('returns null for a key that was never written', async () => {
    const { store } = createLimitedStore(10);
    expect(await createChunkedStorage(store, 10).getItem(KEY)).toBeNull();
  });

  it('round-trips a value longer than the store allows per entry', async () => {
    const { store, entries } = createLimitedStore(10);
    const storage = createChunkedStorage(store, 10);
    const session = 'x'.repeat(95);

    await storage.setItem(KEY, session);

    expect(await storage.getItem(KEY)).toBe(session);
    expect(entries.get(`${KEY}.count`)).toBe('10');
  });

  it('removes leftover pieces when a shorter value replaces a longer one', async () => {
    const { store, entries } = createLimitedStore(10);
    const storage = createChunkedStorage(store, 10);

    await storage.setItem(KEY, 'a'.repeat(45));
    await storage.setItem(KEY, 'b'.repeat(12));

    expect(await storage.getItem(KEY)).toBe('b'.repeat(12));
    expect([...entries.keys()].sort()).toEqual([`${KEY}.0`, `${KEY}.1`, `${KEY}.count`]);
  });

  it('clears every piece on remove', async () => {
    const { store, entries } = createLimitedStore(10);
    const storage = createChunkedStorage(store, 10);
    await storage.setItem(KEY, 'a'.repeat(45));

    await storage.removeItem(KEY);

    expect(await storage.getItem(KEY)).toBeNull();
    expect(entries.size).toBe(0);
  });

  it('reads as signed out when a piece is missing', async () => {
    const { store, entries } = createLimitedStore(10);
    const storage = createChunkedStorage(store, 10);
    await storage.setItem(KEY, 'a'.repeat(45));

    entries.delete(`${KEY}.2`);

    expect(await storage.getItem(KEY)).toBeNull();
  });

  it('keeps two keys apart', async () => {
    const { store } = createLimitedStore(10);
    const storage = createChunkedStorage(store, 10);

    await storage.setItem('first', 'a'.repeat(25));
    await storage.setItem('second', 'b'.repeat(25));

    expect(await storage.getItem('first')).toBe('a'.repeat(25));
    expect(await storage.getItem('second')).toBe('b'.repeat(25));
  });
});
