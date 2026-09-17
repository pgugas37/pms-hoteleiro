import { createBrowserRouter } from 'react-router-dom'

import { AppLayout } from '@/components/AppLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { RequireRole } from '@/components/RequireRole'
import { AcessoNegadoPage } from '@/pages/AcessoNegadoPage'
import { ConfiguracaoInicialPage } from '@/pages/ConfiguracaoInicialPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { HotelSettingsPage } from '@/pages/HotelSettingsPage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { RedefinirSenhaPage } from '@/pages/RedefinirSenhaPage'
import { TrocarSenhaPage } from '@/pages/TrocarSenhaPage'
import { UsersListPage } from '@/pages/UsersListPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/configuracao-inicial', element: <ConfiguracaoInicialPage /> },
  { path: '/redefinir-senha', element: <RedefinirSenhaPage /> },
  { path: '/acesso-negado', element: <AcessoNegadoPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/minha-conta', element: <TrocarSenhaPage /> },
          { path: '/hotel', element: <HotelSettingsPage /> },
          {
            element: <RequireRole roles={['admin']} />,
            children: [{ path: '/usuarios', element: <UsersListPage /> }],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
