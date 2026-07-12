import React, { useEffect, useState } from 'react';
import { apiClient as axios } from '../api/client';
import { Settings, Key, CheckCircle, X, Monitor } from 'lucide-react';

const ClientsList: React.FC = () => {
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  
  const [showProvModal, setShowProvModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedLicense, setGeneratedLicense] = useState<{terminal_id: string, activation_key: string} | null>(null);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const res = await axios.get('http://localhost:8000/api/clm/clients/');
        setClients(res.data);
      } catch (err) {
        console.error("Error fetching clients:", err);
      }
    };
    fetchClients();
  }, []);

  const handleGenerateTerminal = async () => {
    if (!selectedClient) return;
    
    setGenerating(true);
    
    try {
      const terminalId = `POS-${Math.floor(100000 + Math.random() * 900000)}`;
      const segment = () => Math.random().toString(36).substring(2, 6).toUpperCase();
      const activationKey = `${segment()}-${segment()}-${segment()}-${segment()}`;

      // Create TerminalLicense in Django
      await axios.post('http://localhost:8000/api/clm/terminals/', {
        client: selectedClient.id,
        terminal_id: terminalId,
        activation_key: activationKey,
        asset_type: 'POS',
        status: 'CREATED'
      });
      
      setGeneratedLicense({ terminal_id: terminalId, activation_key: activationKey });
    } catch (err) {
      console.error("Error generating terminal:", err);
      alert("Erro ao gerar terminal no backend.");
    } finally {
      setGenerating(false);
    }
  };

  const closeProvModal = () => {
    setShowProvModal(false);
    setGeneratedLicense(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#f0f0f0] text-black font-sans text-[11px] select-none">
      
      {/* Top Search Bar */}
      <div className="flex items-center px-2 py-1 bg-[#e0e0e0] border-b border-[#a0a0a0]">
        <span className="mr-2 text-gray-700 font-bold">Gestão de Clientes</span>
        <div className="flex bg-white border border-[#999] h-[18px]">
          <input type="text" className="px-1 text-[11px] outline-none w-48" placeholder="Pesquisar..." />
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 bg-white overflow-auto border-b border-[#a0a0a0]">
        <table className="w-full text-left border-collapse cursor-default">
          <thead>
            <tr className="bg-gradient-to-b from-[#ffffff] to-[#e0e0e0] border-b border-[#a0a0a0] text-gray-700">
              <th className="py-1 px-2 border-r border-[#ccc] font-normal w-24">Código</th>
              <th className="py-1 px-2 border-r border-[#ccc] font-normal">Nome do Cliente / Entidade</th>
              <th className="py-1 px-2 border-r border-[#ccc] font-normal w-32 text-center">País</th>
              <th className="py-1 px-2 font-normal w-48 text-center">Ativo</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client, i) => (
              <tr 
                key={client.id || i} 
                onClick={() => setSelectedClient(client)}
                className={`border-b border-[#eee] hover:bg-[#cce8ff] ${selectedClient?.id === client.id ? 'bg-[#cce8ff]' : ''}`}
              >
                <td className="py-1 px-2 border-r border-[#eee]">{client.code}</td>
                <td className="py-1 px-2 border-r border-[#eee]">{client.commercial_name}</td>
                <td className="py-1 px-2 border-r border-[#eee] text-center">{client.country}</td>
                <td className="py-1 px-2 text-center">
                  {client.status === 'ACTIVE' ? (
                    <span className="text-green-600 font-bold text-sm leading-none">✓</span>
                  ) : <span className="text-gray-400">-</span>}
                </td>
              </tr>
            ))}
            {/* Empty rows to fill space */}
            {Array.from({ length: Math.max(0, 15 - clients.length) }).map((_, i) => (
              <tr key={`empty-${i}`} className="border-b border-[#eee]">
                <td className="py-3 px-2 border-r border-[#eee]"></td>
                <td className="py-3 px-2 border-r border-[#eee]"></td>
                <td className="py-3 px-2 border-r border-[#eee]"></td>
                <td className="py-3 px-2"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-[#e0e0e0] border-t border-white p-1 flex justify-between items-center text-[11px] h-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        <div className="flex space-x-4 px-2">
          <button 
            disabled={!selectedClient}
            onClick={() => setShowProvModal(true)}
            className={`flex items-center space-x-1 px-2 py-1 rounded ${!selectedClient ? 'opacity-50' : 'hover:bg-[#d0d0d0]'}`}
          >
            <div className="w-5 h-5 rounded-full border border-transparent flex justify-center items-center bg-[#5cb85c] text-white">
              <Monitor size={10} />
            </div>
            <span className="text-gray-700 ml-1 font-bold">Novo Terminal (Activation Key)</span>
          </button>
        </div>
      </div>

      {/* Provisioning Modal */}
      {showProvModal && selectedClient && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-[#f0f0f0] border border-[#a0a0a0] w-[450px] shadow-md flex flex-col">
            <div className="bg-[#333] text-white px-2 py-1 flex justify-between items-center">
              <div className="flex items-center">
                <Settings size={14} className="mr-2" />
                <span className="font-bold text-[11px]">Gerar Código de Ativação do Terminal</span>
              </div>
              <button onClick={closeProvModal} className="hover:text-red-400 font-bold">x</button>
            </div>
            
            <div className="p-4 bg-[#f0f0f0] flex-1">
              {!generatedLicense ? (
                <div className="space-y-4 text-[11px] font-sans bg-white border border-[#a0a0a0] p-4">
                  <div className="flex items-center">
                    <label className="w-32 font-bold">Cliente (Tenant):</label>
                    <input readOnly value={selectedClient.commercial_name} className="flex-1 border border-[#a0a0a0] p-1 bg-[#eee] font-bold" />
                  </div>
                  <div className="flex items-center">
                    <label className="w-32 font-bold">Tipo de Licença:</label>
                    <select className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none bg-white">
                      <option>Terminal POS Operacional</option>
                      <option>Kiosk Self-Service</option>
                    </select>
                  </div>
                  <div className="bg-[#e6f2ff] border border-[#b3d4ff] p-2 text-gray-700 mt-4">
                    Ao gerar a licença, o sistema criará o terminal de imediato no Backend (Django).
                  </div>
                </div>
              ) : (
                <div className="space-y-4 text-[11px] font-sans bg-white border border-[#a0a0a0] p-4">
                  <div className="bg-[#e6ffe6] border border-[#a0e0a0] p-3 text-center mb-4">
                    <Key size={24} className="mx-auto text-green-600 mb-2" />
                    <p className="font-bold text-green-800 text-sm">Chave Gerada e Guardada!</p>
                    <p className="text-gray-600 mt-1">Forneça estas credenciais ao cliente ou técnico de instalação.</p>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-gray-500 font-bold mb-1">Terminal ID (Fixo)</label>
                      <input value={generatedLicense.terminal_id} readOnly className="w-full border border-[#a0a0a0] p-2 bg-[#f9f9f9] font-mono font-bold text-blue-800" />
                    </div>
                    <div>
                      <label className="block text-gray-500 font-bold mb-1">Activation Key (Uso Único)</label>
                      <input value={generatedLicense.activation_key} readOnly className="w-full border border-[#a0a0a0] p-2 bg-[#f9f9f9] font-mono font-bold text-red-800 tracking-widest text-center" />
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="bg-[#e0e0e0] border-t border-[#b0b0b0] p-2 flex justify-end space-x-2">
              {!generatedLicense && (
                <button 
                  onClick={handleGenerateTerminal} 
                  disabled={generating}
                  className="flex items-center space-x-1 hover:bg-[#d0d0d0] px-3 py-1 rounded border border-[#a0a0a0] bg-white"
                >
                  <CheckCircle size={12} className="text-green-600" />
                  <span className="font-bold text-green-700">{generating ? 'Gerando...' : 'Gerar e Guardar'}</span>
                </button>
              )}
              <button 
                onClick={closeProvModal} 
                className="flex items-center space-x-1 hover:bg-[#d0d0d0] px-3 py-1 rounded border border-[#a0a0a0] bg-white"
              >
                <X size={12} className="text-gray-600" />
                <span className="font-bold">{generatedLicense ? "Concluir" : "Cancelar"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientsList;
