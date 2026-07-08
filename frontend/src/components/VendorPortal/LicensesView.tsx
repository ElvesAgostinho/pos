import React, { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicGrid from '../ui/ClassicGrid';
import ClassicButton from '../ui/ClassicButton';
import { Settings, Plus, Key, CheckCircle, X } from 'lucide-react';

const LicensesView: React.FC = () => {
  const [showProvModal, setShowProvModal] = useState(false);
  const [generatedLicense, setGeneratedLicense] = useState<{terminal_id: string, activation_key: string} | null>(null);

  const columns = [
    { header: 'Cliente (Tenant)', accessor: 'client', width: '30%' },
    { header: 'Plano Ativo', accessor: 'plan', width: '20%' },
    { header: 'Assinatura RSA', accessor: 'rsa_status', width: '20%' },
    { header: 'Validade JWT', accessor: 'validity', width: '30%' }
  ];

  const data = [
    { client: 'Palmeiras Suite Hotel', plan: 'Plano Pro', rsa_status: 'Assinado ✓', validity: '2027-12-31' },
    { client: 'Restaurante O Marujo', plan: 'Plano Essential', rsa_status: 'Assinado ✓', validity: '2026-05-15' },
  ];

  const handleGenerateLicense = () => {
    const terminalId = `POS-${Math.floor(100000 + Math.random() * 900000)}`;
    const segment = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    const key = `${segment()}-${segment()}-${segment()}-${segment()}`;
    setGeneratedLicense({ terminal_id: terminalId, activation_key: key });
  };

  return (
    <>
      <ClassicWindow 
        title="Emissão de Licenças (RSA)" 
        icon={<Settings size={14} className="text-gray-300" />}
        footer={
          <div className="flex space-x-2">
            <ClassicButton icon={Plus} label="Novo Provisionamento de Terminal" onClick={() => setShowProvModal(true)} />
          </div>
        }
      >
        <ClassicGrid columns={columns} data={data} />
      </ClassicWindow>

      {/* Provisioning Modal */}
      {showProvModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <ClassicWindow
            title="Novo Provisionamento de Terminal"
            icon={<Settings size={14} className="text-gray-300" />}
            width="450px"
            footer={
              <>
                {!generatedLicense && (
                  <ClassicButton icon={CheckCircle} label="Gerar Activation Key" onClick={handleGenerateLicense} className="text-green-700" />
                )}
                <ClassicButton icon={X} label={generatedLicense ? "Concluir" : "Cancelar"} onClick={() => { setShowProvModal(false); setGeneratedLicense(null); }} />
              </>
            }
          >
            <div className="p-4 bg-[#f0f0f0] h-full">
              {!generatedLicense ? (
                <div className="space-y-4 text-[11px] font-sans bg-white border border-[#a0a0a0] p-4">
                  <div className="flex items-center">
                    <label className="w-32 font-bold">Cliente (Tenant):</label>
                    <select className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none bg-white">
                      {data.map(c => <option key={c.client} value={c.client}>{c.client}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center">
                    <label className="w-32 font-bold">Tipo de Licença:</label>
                    <select className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none bg-white">
                      <option>Terminal POS Operacional</option>
                      <option>Kiosk Self-Service</option>
                    </select>
                  </div>
                  <div className="bg-[#e6f2ff] border border-[#b3d4ff] p-2 text-gray-700 mt-4">
                    Ao gerar a licença, será consumida 1 vaga do plafond de terminais do cliente selecionado.
                  </div>
                </div>
              ) : (
                <div className="space-y-4 text-[11px] font-sans bg-white border border-[#a0a0a0] p-4">
                  <div className="bg-[#e6ffe6] border border-[#a0e0a0] p-3 text-center mb-4">
                    <Key size={24} className="mx-auto text-green-600 mb-2" />
                    <p className="font-bold text-green-800 text-sm">Chave Gerada com Sucesso</p>
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
          </ClassicWindow>
        </div>
      )}
    </>
  );
};

export default LicensesView;
