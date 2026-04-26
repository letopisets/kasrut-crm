declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential?: string }) => void }) => void
          renderButton: (parent: HTMLElement, options: Record<string, string | number | boolean>) => void
        }
      }
    }
    AppleID?: {
      auth: {
        init: (config: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }) => void
        signIn: () => Promise<{ authorization?: { id_token?: string } }>
      }
    }
  }
}

const loadedScripts = new Map<string, Promise<void>>()

export function loadScript(id: string, src: string): Promise<void> {
  if (loadedScripts.has(id)) return loadedScripts.get(id)!

  const existing = document.getElementById(id)
  if (existing) {
    const promise = Promise.resolve()
    loadedScripts.set(id, promise)
    return promise
  }

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.id = id
    script.src = src
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Cannot load ${src}`))
    document.head.appendChild(script)
  })

  loadedScripts.set(id, promise)
  return promise
}
