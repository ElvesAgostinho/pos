import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Topbar from './components/Topbar';
import TabsBar from './components/TabsBar';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import StatusBar from './components/StatusBar';
import LockScreen from './components/ui/LockScreen';
import QuickNotes from './components/ui/QuickNotes';
import EdcInboxView from './components/views/EdcInboxView';
import POSApp from './POSApp';
import 'ag-grid-enterprise';
import { Package, Tags, Users, FileText, Settings, Network, ShoppingBag, Shield } from 'lucide-react';

// Dictionary of views
const VIEW_METADATA: Record<string, { title: string; icon: any }> = {
  'dashboard': { title: 'Dashboard MDM', icon: FileText },
  'items': { title: 'Gestão de Artigos', icon: Package },
  'categories': { title: 'Categorias', icon: Tags },
  'brands': { title: 'Marcas', icon: Tags },
  'suppliers': { title: 'Fornecedores', icon: Users },
  'taxes': { title: 'Impostos', icon: FileText },
  'uoms': { title: 'Unidades de Medida', icon: Settings },
  'warehouses': { title: 'Armazéns', icon: Network },
  'locations': { title: 'Localizações', icon: Network },
  'bom': { title: 'Fichas Técnicas (Antigo)', icon: FileText },
  'inventory_dashboard': { title: 'Gestão de Inventário', icon: Package },
  'inventory_recipes': { title: 'Fichas Técnicas (Receitas)', id: 'inventory_recipes', icon: FileText },
  'inventory_stock': { title: 'Níveis de Stock', icon: Package },
  'procurement_suppliers': { title: 'Gestão de Fornecedores', icon: Users },
  'procurement_pos': { title: 'Purchase Orders (POs)', icon: ShoppingBag },
  'procurement_grns': { title: 'Receção de Mercadorias (GRNs)', icon: Package },
  'stock_levels': { title: 'Níveis de Stock (Antigo)', icon: Package },
  'stock_movements': { title: 'Movimentos', icon: ShoppingBag },
  'outlets': { title: 'Outlets', icon: Settings },
  'pos_terminals': { title: 'Terminais POS', icon: Settings },
  'pos_product_config': { title: 'Config. Produtos POS', icon: Settings },
  'operation_config': { title: 'Motor de Operação', icon: Settings },
  'pos_terminal': { title: 'Terminal POS (Frente de Loja)', icon: ShoppingBag },
  'reports_sales': { title: 'Vendas Diárias', icon: FileText },
  'reports_stock': { title: 'Stock Atual', icon: FileText },
  'edc_inbox': { title: 'EDC - Caixa de Entrada', icon: FileText },
  'settings': { title: 'Configurações', icon: Settings },
  // HR Views
  'hr_collaborators': { title: 'Colaboradores', icon: Users },
  'hr_pos_operators': { title: 'Operadores POS', icon: Users },
  'hr_shifts': { title: 'Gestão de Turnos', icon: Settings },
  'hr_departments': { title: 'Departamentos', icon: Network },
  // Auth Engine Views
  'auth_roles': { title: 'Perfis de Segurança', icon: Shield },
  'auth_matrix': { title: 'Matriz de Permissões', icon: Shield },
  'auth_abac': { title: 'Regras ABAC', icon: Shield },
};

function BackofficeApp() {
  const [openTabs, setOpenTabs] = useState<string[]>(['dashboard']);
  const [activeView, setActiveView] = useState('dashboard');
  const [isLocked, setIsLocked] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const handleSelectView = (view: string) => {
    if (!openTabs.includes(view)) {
      setOpenTabs([...openTabs, view]);
    }
    setActiveView(view);
  };

  const handleCloseTab = (viewToClose: string) => {
    const newTabs = openTabs.filter(v => v !== viewToClose);
    setOpenTabs(newTabs);
    
    if (activeView === viewToClose) {
      if (newTabs.length > 0) {
        setActiveView(newTabs[newTabs.length - 1]);
      } else {
        setActiveView('');
      }
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#e0e0e0] font-sans">
      <Topbar onSelectView={handleSelectView} />
      <TabsBar 
        openTabs={openTabs} 
        activeView={activeView} 
        onSelectTab={setActiveView} 
        onCloseTab={handleCloseTab} 
        viewMetadata={VIEW_METADATA}
        onLock={() => setIsLocked(true)}
        onToggleNotes={() => setShowNotes(!showNotes)}
        onCloseAllTabs={() => {
          setOpenTabs(['dashboard']);
          setActiveView('dashboard');
        }}
      />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar activeView={activeView} onSelectView={handleSelectView} />
        {activeView ? (
          <MainContent activeView={activeView} onClose={() => handleCloseTab(activeView)} />
        ) : (
          <div className="flex-1 flex flex-col bg-[#e6e6e6] items-center justify-center text-gray-400">
            <img src="/logo.png" alt="System Mwana Lodge" className="h-24 object-contain mb-4" />
            <h2 className="text-xl font-bold mb-2 text-gray-500">System Mwana Lodge</h2>
            <p>Selecione uma opção no menu para começar.</p>
          </div>
        )}
      </div>
      <StatusBar 
        openTabs={openTabs} 
        activeView={activeView} 
        onSelectTab={setActiveView} 
        viewMetadata={VIEW_METADATA} 
      />
      {isLocked && <LockScreen onUnlock={() => setIsLocked(false)} />}
      {showNotes && <QuickNotes onClose={() => setShowNotes(false)} />}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/pos/*" element={<POSApp />} />
        <Route path="/*" element={<BackofficeApp />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
