import React, { useState } from 'react';
import Topbar from './components/Topbar';
import TabsBar from './components/TabsBar';
import Sidebar from './components/Sidebar';
import StatusBar from './components/StatusBar';
import LockScreen from './components/ui/LockScreen';
import QuickNotes from './components/ui/QuickNotes';
import Dashboard from './pages/Dashboard';
import Wizard from './pages/Wizard';
import ClientsList from './pages/ClientsList';
import { Shield, Users, Database } from 'lucide-react';

const VIEW_METADATA: Record<string, { title: string; icon: any }> = {
  'dashboard': { title: 'Dashboard PCC', icon: Database },
  'clients': { title: 'Gestão de Clientes', icon: Users },
  'provisioning': { title: 'Novo Provisionamento', icon: Shield },
};

function MainContent({ activeView, onClose }: { activeView: string; onClose: () => void }) {
  return (
    <div className="flex-1 h-full overflow-hidden relative">
      <div className="h-full overflow-y-auto">
        {activeView === 'dashboard' && <Dashboard />}
        {activeView === 'clients' && <ClientsList />}
        {activeView === 'provisioning' && <Wizard />}
      </div>
    </div>
  );
}

function App() {
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
            <h2 className="text-xl font-bold mb-2 text-gray-500">Platform Control Center</h2>
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

export default App;
