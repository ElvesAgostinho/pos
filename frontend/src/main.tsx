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
import GuideDialog from './components/ui/GuideDialog.tsx'
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
  const { data, isLoading, isError, refetch } = useLicenseStatus();
  if (isLoading) {
    return <div className="h-screen w-screen flex items-center justify-center bg-[#0e1622] text-gray-300 text-sm">A validar licença…</div>;
  }
  // Falha de REDE (servidor em baixo/a arrancar) NÃO é "sem licença" — não manda para o
  // onboarding; mostra o erro com opção de repetir.
  if (isError) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#0e1622]">
        <div className="bg-white border border-[#8fa4bb] shadow-2xl w-[440px]">
          <div className="px-4 py-2 bg-[#a01818] text-white font-bold text-sm">Sem ligação ao servidor</div>
          <div className="p-4 text-[12px] text-gray-700 space-y-3">
            <p>Não foi possível contactar o servidor da aplicação (<b>localhost:8000</b>). Verifique se o serviço está a correr.</p>
            <div className="flex gap-2">
              <button onClick={() => refetch()} className="px-3 py-1.5 bg-[#1e3f66] text-white text-[12px] font-semibold">Tentar novamente</button>
              <button onClick={() => window.location.reload()} className="px-3 py-1.5 bg-[#f0f0f0] border border-[#a0a0a0] text-[12px]">Recarregar</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  // Só vai para o onboarding se o servidor RESPONDER a dizer que não há licença.
  if (!data?.licensed) {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
};

// Se JÁ existe licença válida, o onboarding não faz sentido — entra direto no sistema.
// (Evita ficar "preso" em /onboarding depois de a licença ser ativada.)
const SkipOnboardingIfLicensed = ({ children }: { children: JSX.Element }) => {
  const { data, isLoading } = useLicenseStatus();
  if (isLoading) {
    return <div className="h-screen w-screen flex items-center justify-center bg-[#0e1622] text-gray-300 text-sm">A validar licença…</div>;
  }
  if (data?.licensed) {
    return <Navigate to="/backoffice/login" replace />;
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
            <Route path="/onboarding" element={<SkipOnboardingIfLicensed><Onboarding /></SkipOnboardingIfLicensed>} />
            
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
          {/* Popup explicativo global: quando algo corre mal, orienta o utilizador. */}
          <GuideDialog />
        </BrowserRouter>
      </AuthorizationProvider>
    </QueryClientProvider>
  </StrictMode>,
)
