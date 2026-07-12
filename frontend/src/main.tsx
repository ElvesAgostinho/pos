import { StrictMode } from 'react'
import type { JSX } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import CustomerLogin from './pages/CustomerLogin.tsx'
import PosStation from './pages/PosStation.tsx'
import BookingSite from './pages/BookingSite.tsx'
import BookingManage from './pages/BookingManage.tsx'

// New Auth & Arch Components
import Onboarding from './pages/Onboarding.tsx'
import PosLoginModern from './pages/PosLoginModern.tsx'
import Launchpad from './pages/Launchpad.tsx'
import { useLicenseStatus } from './hooks/useActiveModules'
import { AuthorizationProvider } from './engine/authorization';
import { mockAuthState } from './engine/authorization/mockData';

const queryClient = new QueryClient()

// Emular o login inicial com um user mock (ex: Administrador)
const initialAuthState = {
  userRoleIds: ['role_admin'], // Pode trocar por 'role_waiter' para testar os limites
  policies: mockAuthState.policies,
  baseContext: {
    hotel_id: '1',
    department_id: 'restaurante',
    current_time: '12:00',
    current_shift: 'Tarde' as const
  }
};

// Componente Intercetor (Verifica Licença)
const RequireLicense = ({ children }: { children: JSX.Element }) => {
  // Validação REAL da licença (fonte: PCC/clm no admin, fallback license.key assinada).
  const { data, isLoading, isError } = useLicenseStatus();
  if (isLoading) {
    return <div className="h-screen w-screen flex items-center justify-center bg-black text-gray-300 text-sm">A validar licença…</div>;
  }
  if (isError || !data?.licensed) {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
};

// Guarda de sessão do Backoffice (exige JWT válido guardado)
const RequireAuth = ({ children }: { children: JSX.Element }) => {
  const hasToken = !!localStorage.getItem('erp_access');
  if (!hasToken) {
    return <Navigate to="/backoffice/login" replace />;
  }
  return children;
};

// Guarda de sessão do Operador POS (exige login por PIN)
const RequirePosOperator = ({ children }: { children: JSX.Element }) => {
  const hasOperator = !!localStorage.getItem('pos_operator_token');
  if (!hasOperator) {
    return <Navigate to="/pos/login" replace />;
  }
  return children;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthorizationProvider state={initialAuthState}>
        <BrowserRouter>
          <Routes>
            {/* First Boot */}
            <Route path="/onboarding" element={<Onboarding />} />
            
            {/* Backoffice Portal (Nível 2) */}
            <Route path="/backoffice/login" element={<RequireLicense><CustomerLogin /></RequireLicense>} />
            <Route path="/portal" element={<RequireLicense><RequireAuth><Launchpad /></RequireAuth></RequireLicense>} />
            <Route path="/backoffice/*" element={<RequireLicense><RequireAuth><App /></RequireAuth></RequireLicense>} />

            {/* Frontoffice Launcher (Nível 3) */}
            <Route path="/pos/login" element={<RequireLicense><PosLoginModern /></RequireLicense>} />
            <Route path="/pos/terminal" element={<RequireLicense><RequirePosOperator><PosStation /></RequirePosOperator></RequireLicense>} />
            
            {/* Site PÚBLICO do motor de reservas (multi-tenant por slug, sem login).
                Servido separadamente em produção (cloud), mas partilha a API do PMS. */}
            <Route path="/book/:slug" element={<BookingSite />} />
            <Route path="/reserva/:slug" element={<BookingManage />} />

            {/* Default Route (No Selector) */}
            <Route path="/" element={<Navigate to="/pos/login" replace />} />
            {/* NOTA: a consola de licenciamento (PCC) vive no projeto separado frontend_pcc/
                (produto do FORNECEDOR). Nunca é servida no ERP do cliente. */}
          </Routes>
        </BrowserRouter>
      </AuthorizationProvider>
    </QueryClientProvider>
  </StrictMode>,
)
