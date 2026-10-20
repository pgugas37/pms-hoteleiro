import 'fake-indexeddb/auto'

// localStorage em memória (o Node não tem um confiável sem flags)
const store = new Map<string, string>()
const memoryStorage = {
  get length() {
    return store.size
  },
  clear: () => store.clear(),
  getItem: (key: string) => store.get(key) ?? null,
  key: (index: number) => Array.from(store.keys())[index] ?? null,
  removeItem: (key: string) => {
    store.delete(key)
  },
  setItem: (key: string, value: string) => {
    store.set(key, String(value))
  },
}
Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage as unknown as Storage, configurable: true })
