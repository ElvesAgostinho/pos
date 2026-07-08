import React, { useState, useEffect } from 'react';
import OnboardingScreen from './components/pos/OnboardingScreen';
import ClassicWindow from './components/ui/ClassicWindow';
import { ShoppingBag } from 'lucide-react';

const POSApp: React.FC = () => {
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [terminalName, setTerminalName] = useState<string>('');

  useEffect(() => {
    // Check local storage for an existing token
    const token = localStorage.getItem('pos_device_token');
    const name = localStorage.getItem('pos_terminal_name');
    if (token) {
      setDeviceToken(token);
      setTerminalName(name || 'Terminal Desconhecido');
    }
  }, []);

  const handleOnboardingSuccess = (token: string, name: string) => {
    localStorage.setItem('pos_device_token', token);
    localStorage.setItem('pos_terminal_name', name);
    setDeviceToken(token);
    setTerminalName(name);
  };

  if (!deviceToken) {
    return <OnboardingScreen onSuccess={handleOnboardingSuccess} />;
  }

  // If token exists, render the actual Frontoffice POS
  return (
    <div className="h-screen w-screen bg-[#008080] p-4 flex flex-col">
      <ClassicWindow 
        title={`Frente de Loja - ${terminalName}`} 
        icon={<ShoppingBag size={14} className="text-gray-300" />}
      >
        <div className="flex-1 flex items-center justify-center bg-[#c0c0c0]">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-[#1e3f66] mb-4">POS Frontoffice</h1>
            <p className="text-xl">Terminal Ativo: {terminalName}</p>
            <p className="text-sm mt-8 text-gray-600">A Interface Tátil Clássica será implementada aqui.</p>
            
            <button 
              onClick={() => {
                localStorage.removeItem('pos_device_token');
                localStorage.removeItem('pos_terminal_name');
                setDeviceToken(null);
              }}
              className="mt-12 px-4 py-2 border-2 border-t-white border-l-white border-b-gray-800 border-r-gray-800 bg-[#dfdfdf] font-bold active:border-t-gray-800 active:border-l-gray-800 active:border-b-white active:border-r-white"
            >
              Desvincular Terminal (Teste)
            </button>
          </div>
        </div>
      </ClassicWindow>
    </div>
  );
};

export default POSApp;
