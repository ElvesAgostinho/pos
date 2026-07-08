import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import CustomerLogin from './pages/CustomerLogin.tsx'
import PosTerminal from './pages/PosTerminal.tsx'
import VendorApp from './VendorApp.tsx'

// New Auth & Arch Components
import Onboarding from './pages/Onboarding.tsx'
import PosLoginModern from './pages/PosLoginModern.tsx'
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
  const isLicensed = true; // localStorage.getItem('ERP_LICENSED') === 'true';
  if (!isLicensed) {
    return <Navigate to="/onboarding" replace />;
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
            <Route path="/backoffice/*" element={<RequireLicense><App /></RequireLicense>} />
            
            {/* Frontoffice Launcher (Nível 3) */}
            <Route path="/pos/login" element={<RequireLicense><PosLoginModern /></RequireLicense>} />
            <Route path="/pos/terminal" element={<RequireLicense><PosTerminal /></RequireLicense>} />
            
            {/* Default Route (No Selector) */}
            <Route path="/" element={<Navigate to="/pos/login" replace />} />
            
            {/* Other existing routes */}
            <Route path="/vendor/*" element={<VendorApp />} />
          </Routes>
        </BrowserRouter>
      </AuthorizationProvider>
    </QueryClientProvider>
  </StrictMode>,
)
