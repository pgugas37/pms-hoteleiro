import { createBrowserRouter } from 'react-router-dom'

import { AppLayout } from '@/components/AppLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { RequireRole } from '@/components/RequireRole'
import { AcessoNegadoPage } from '@/pages/AcessoNegadoPage'
import { ConfiguracaoInicialPage } from '@/pages/ConfiguracaoInicialPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { FinanceiroPage } from '@/pages/FinanceiroPage'
import { GovernancaPage } from '@/pages/GovernancaPage'
import { GuestsPage } from '@/pages/GuestsPage'
import { HotelSettingsPage } from '@/pages/HotelSettingsPage'
import { LoginPage } from '@/pages/LoginPage'
import { MaintenancePage } from '@/pages/MaintenancePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { OccupancyMapPage } from '@/pages/OccupancyMapPage'
import { RedefinirSenhaPage } from '@/pages/RedefinirSenhaPage'
import { ReservationsPage } from '@/pages/ReservationsPage'
import { RoomsPage } from '@/pages/RoomsPage'
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
          { path: '/quartos', element: <RoomsPage /> },
          { path: '/hospedes', element: <GuestsPage /> },
          { path: '/reservas', element: <ReservationsPage /> },
          { path: '/mapa', element: <OccupancyMapPage /> },
          {
            element: <RequireRole roles={['admin', 'gerente', 'governanca']} />,
            children: [{ path: '/governanca', element: <GovernancaPage /> }],
          },
          {
            element: <RequireRole roles={['admin', 'gerente', 'recepcao', 'governanca', 'manutencao']} />,
            children: [{ path: '/manutencao', element: <MaintenancePage /> }],
          },
          {
            element: <RequireRole roles={['admin', 'gerente', 'recepcao', 'financeiro']} />,
            children: [{ path: '/financeiro', element: <FinanceiroPage /> }],
          },
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
