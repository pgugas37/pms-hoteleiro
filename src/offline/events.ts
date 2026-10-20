type Listener = () => void

const localListeners = new Set<Listener>()
const serverListeners = new Set<Listener>()

/** A cópia local mudou por uma ação do usuário (as telas precisam reler). */
export function onLocalChange(listener: Listener): () => void {
  localListeners.add(listener)
  return () => {
    localListeners.delete(listener)
  }
}

export function emitLocalChange(): void {
  localListeners.forEach((listener) => listener())
}

/** Uma ação só-online mudou o banco: vale baixar as novidades agora. */
export function onServerChange(listener: Listener): () => void {
  serverListeners.add(listener)
  return () => {
    serverListeners.delete(listener)
  }
}

export function emitServerChange(): void {
  serverListeners.forEach((listener) => listener())
}
