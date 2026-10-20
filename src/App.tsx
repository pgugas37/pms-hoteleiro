import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'

import { ConfirmProvider } from '@/components/ConfirmDialog'
import { AuthProvider } from '@/lib/auth-context'
import { SyncProvider } from '@/offline/sync-context'
import { router } from '@/router'

// networkMode 'always': as telas leem da cópia local, então não devem esperar a internet voltar.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { networkMode: 'always', retry: 1 },
    mutations: { networkMode: 'always' },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SyncProvider>
          <ConfirmProvider>
            <RouterProvider router={router} />
          </ConfirmProvider>
        </SyncProvider>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  )
}
