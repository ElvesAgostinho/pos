import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Smartphone } from 'lucide-react';

const AppSelector: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#e0e5ec] flex flex-col items-center justify-center p-4">
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Hospitality<span className="text-[#90c040]">ERP</span></h1>
        <p className="text-gray-500 mt-2">Selecione o ambiente de trabalho</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">
        {/* Backoffice Option */}
        <button 
          onClick={() => navigate('/backoffice/login')}
          className="group relative bg-white p-8 rounded shadow-lg hover:shadow-2xl transition-all flex flex-col items-center border border-gray-200 hover:border-blue-500"
        >
          <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <LayoutDashboard size={48} />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Backoffice Portal</h2>
          <p className="text-gray-500 text-center text-sm">
            Gestão, Configurações, Recursos Humanos, Relatórios Financeiros e PMS Admin.
          </p>
          <div className="mt-6 px-4 py-1 bg-gray-100 text-gray-600 rounded text-xs font-semibold uppercase tracking-wider">
            Administração
          </div>
        </button>

        {/* Frontoffice Option */}
        <button 
          onClick={() => navigate('/pos/login')}
          className="group relative bg-white p-8 rounded shadow-lg hover:shadow-2xl transition-all flex flex-col items-center border border-gray-200 hover:border-[#90c040]"
        >
          <div className="w-24 h-24 bg-[#f0fdf4] text-[#90c040] rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Smartphone size={48} />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Frontoffice Launcher</h2>
          <p className="text-gray-500 text-center text-sm">
            Terminal Tátil (POS), Quartos, Receção, SPA e Operação Rápida.
          </p>
          <div className="mt-6 px-4 py-1 bg-gray-100 text-gray-600 rounded text-xs font-semibold uppercase tracking-wider">
            Operação
          </div>
        </button>
      </div>

      <div className="mt-16 text-xs text-gray-400">
        Instalação Local (Offline Mode) • Licença Ativa
      </div>
    </div>
  );
};

export default AppSelector;
