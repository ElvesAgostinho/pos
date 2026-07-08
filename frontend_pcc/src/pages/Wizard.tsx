import React, { useState } from 'react';
import axios from 'axios';
import { CheckCircle, ChevronRight, Copy, ChevronDown, ChevronRight as ChevronIcon } from 'lucide-react';

const AVAILABLE_MODULES = [
  { id: 'CORE', name: 'Platform Admin (Core)', submodules: ['Users & Roles', 'Audit Logs', 'Settings'] },
  { id: 'POS', name: 'POS (Pontos de Venda)', submodules: ['Restaurant', 'Retail', 'KDS', 'Tables'] },
  { id: 'PMS', name: 'PMS (Quartos)', submodules: ['Booking Engine', 'Housekeeping', 'Reception'] },
  { id: 'WMS', name: 'WMS (Armazéns/Stock)', submodules: ['Inventory', 'Suppliers', 'Purchasing'] },
  { id: 'FIN', name: 'Financials (Contabilidade)', submodules: ['Invoicing', 'Treasury', 'Taxes'] },
  { id: 'HR', name: 'HR (Recursos Humanos)', submodules: ['Payroll', 'Attendance', 'Recruitment'] }
];

const Wizard: React.FC = () => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [licenseKey, setLicenseKey] = useState("");
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  
  const [selectedModules, setSelectedModules] = useState<Record<string, string[]>>({
    'CORE': ['Users & Roles', 'Audit Logs', 'Settings'],
    'POS': ['Restaurant', 'Tables'],
    'PMS': ['Reception']
  });
  
  const [formData, setFormData] = useState({
    commercial_name: '',
    nif: '',
    country: 'Angola',
    general_email: '',
    plan: 'Enterprise',
    max_hotels: 5,
    max_pos: 20
  });

  const steps = [
    "Dados Gerais", "Empresa e Hotel", "Módulos", "Licença", "Resumo"
  ];

  const handleNext = () => setStep(prev => Math.min(prev + 1, steps.length));
  const handleBack = () => setStep(prev => Math.max(prev - 1, 1));

  const handleProvision = async () => {
    setLoading(true);
    try {
      // 1. Create Client
      const clientRes = await axios.post('http://localhost:8000/api/clm/clients/', {
        code: `CLI-${Math.floor(Math.random() * 10000)}`,
        commercial_name: formData.commercial_name || 'Novo Cliente',
        nif: formData.nif,
        country: formData.country,
        general_email: formData.general_email,
        status: 'ACTIVE'
      });
      
      const clientId = clientRes.data.id;
      
      // 2. Create License
      const licenseRes = await axios.post('http://localhost:8000/api/clm/licenses/', {
        client: clientId,
        license_number: `LIC-${Math.floor(Math.random() * 100000)}`,
        plan: formData.plan,
        modules: Object.keys(selectedModules),
        feature_flags: selectedModules,
        max_hotels: formData.max_hotels,
        max_pos: formData.max_pos,
        max_users: 10,
        is_offline: true
      });
      
      setLicenseKey(licenseRes.data.signature || "Assinatura gerada no backend...");
      setSuccess(true);
    } catch (err) {
      console.error("Error provisioning:", err);
      alert("Erro ao provisionar cliente. Verifique a consola.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="p-4 bg-[#e6e6e6] h-full overflow-auto text-black font-sans text-xs flex justify-center items-center">
        <div className="bg-[#f0f0f0] border border-[#a0a0a0] p-4 w-[500px] shadow-md">
          <div className="bg-[#333] text-white px-2 py-1 flex justify-between items-center mb-4">
            <span className="font-bold text-[11px]">Deploy Concluído</span>
            <span className="text-red-400 font-bold cursor-pointer hover:text-white">X</span>
          </div>
          
          <div className="flex mb-4">
            <div className="w-12 h-12 bg-[#90c040] text-white flex justify-center items-center font-bold text-2xl border border-black mr-4">
              ✓
            </div>
            <div>
              <p className="font-bold mb-1">O cliente foi provisionado com sucesso na Cloud (PCC).</p>
              <p className="text-gray-600 text-[10px] mb-2">
                Copie a chave criptografada abaixo para instalar o Hospitality ERP no servidor local do cliente.
              </p>
            </div>
          </div>

          <div className="bg-white border border-[#999] p-2 mb-4">
            <code className="text-[10px] text-gray-800 break-all select-all block mb-2">{licenseKey}</code>
            <button className="px-3 py-1 bg-[#e0e0e0] border border-[#a0a0a0] hover:bg-[#d0d0d0]">
              Copiar Chave RSA
            </button>
          </div>
          
          <div className="flex justify-end border-t border-[#ccc] pt-2 mt-2">
            <button 
              onClick={() => {setSuccess(false); setStep(1);}}
              className="px-4 py-1 border border-[#333] bg-[#333] text-white hover:bg-[#444]"
            >
              Concluir
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-[#e6e6e6] h-full overflow-auto text-black font-sans text-xs">
      <div className="border-b border-[#cccccc] pb-2 mb-4">
        <h1 className="text-lg font-bold text-[#333]">Novo Cliente - Provisioning Engine</h1>
      </div>
      
      {/* Stepper */}
      <div className="flex items-center mb-6 bg-white border border-[#ccc] p-2 text-[11px]">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center mr-4">
            <div className={`w-4 h-4 rounded-full flex items-center justify-center font-bold text-[9px] mr-1
              ${step > i + 1 ? 'bg-[#90c040] text-white' : step === i + 1 ? 'bg-[#333] text-white' : 'bg-[#e0e0e0] text-[#888]'}`}>
              {step > i + 1 ? '✓' : i + 1}
            </div>
            <span className={`${step >= i + 1 ? 'text-black font-bold' : 'text-gray-500'}`}>{s}</span>
            {i < steps.length - 1 && <span className="text-gray-300 ml-4">»</span>}
          </div>
        ))}
      </div>

      {/* Form Content */}
      <div className="flex-1 bg-white overflow-auto">
        <div className="p-4">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold border-b border-[#eee] pb-1">1. Dados da Entidade</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 mb-1">Nome Comercial</label>
                  <input type="text" className="w-full border border-[#999] px-2 py-1 text-xs" placeholder="Ex: Grupo Pestana" 
                    value={formData.commercial_name} onChange={e => setFormData({...formData, commercial_name: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 mb-1">NIF</label>
                  <input type="text" className="w-full border border-[#999] px-2 py-1 text-xs" placeholder="Ex: 500123456" 
                    value={formData.nif} onChange={e => setFormData({...formData, nif: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 mb-1">País</label>
                  <select className="w-full border border-[#999] px-2 py-1 text-xs"
                    value={formData.country} onChange={e => setFormData({...formData, country: e.target.value})}>
                    <option>Angola</option><option>Portugal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 mb-1">E-mail de Contacto</label>
                  <input type="email" className="w-full border border-[#999] px-2 py-1 text-xs" 
                    value={formData.general_email} onChange={e => setFormData({...formData, general_email: e.target.value})} />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold border-b border-[#eee] pb-1">2. Estrutura Base</h2>
              <p className="text-gray-600 mb-2 text-[10px]">O Provisioning Engine criará esta estrutura automaticamente.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 mb-1">Nome da Empresa Matriz</label>
                  <input type="text" className="w-full border border-[#999] px-2 py-1 text-xs" defaultValue="Pestana Management" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 mb-1">Nome do Primeiro Hotel</label>
                  <input type="text" className="w-full border border-[#999] px-2 py-1 text-xs" defaultValue="Hotel Luanda" />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold border-b border-[#eee] pb-1">3. Ativação de Módulos & Sub-funcionalidades</h2>
              <div className="flex flex-col gap-2">
                {AVAILABLE_MODULES.map((mod) => {
                  const isChecked = Object.keys(selectedModules).includes(mod.id);
                  const isExpanded = expandedModule === mod.id;
                  
                  return (
                    <div key={mod.id} className="border border-[#ccc] bg-[#f9f9f9]">
                      <div className="flex items-center p-2 hover:bg-[#f0f0f0] cursor-pointer">
                        <button 
                          className="mr-2 text-gray-500 hover:text-black"
                          onClick={(e) => { e.preventDefault(); setExpandedModule(isExpanded ? null : mod.id); }}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronIcon size={14} />}
                        </button>
                        <label className="flex items-center cursor-pointer flex-1" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            className="mr-2" 
                            checked={isChecked}
                            onChange={(e) => {
                              const newSelected = { ...selectedModules };
                              if (e.target.checked) {
                                newSelected[mod.id] = [...mod.submodules];
                              } else {
                                delete newSelected[mod.id];
                              }
                              setSelectedModules(newSelected);
                            }}
                          />
                          <span className="font-bold text-[#333]">{mod.name}</span>
                        </label>
                      </div>
                      
                      {isExpanded && (
                        <div className="pl-8 pb-2 pr-2 bg-white border-t border-[#eee]">
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            {mod.submodules.map((sub, i) => {
                              const isSubChecked = isChecked && selectedModules[mod.id]?.includes(sub);
                              return (
                                <label key={i} className={`flex items-center p-1 rounded cursor-pointer ${!isChecked ? 'opacity-50' : 'hover:bg-[#e6f2ff]'}`}>
                                  <input 
                                    type="checkbox" 
                                    className="mr-2" 
                                    disabled={!isChecked}
                                    checked={isSubChecked}
                                    onChange={(e) => {
                                      if (!isChecked) return;
                                      const newSelected = { ...selectedModules };
                                      if (e.target.checked) {
                                        newSelected[mod.id] = [...(newSelected[mod.id] || []), sub];
                                      } else {
                                        newSelected[mod.id] = newSelected[mod.id].filter(s => s !== sub);
                                      }
                                      setSelectedModules(newSelected);
                                    }}
                                  />
                                  <span className="text-[10px] text-gray-700">{sub}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold border-b border-[#eee] pb-1">4. Detalhes da Licença</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 mb-1">Plano Contratado</label>
                  <select className="w-full border border-[#999] px-2 py-1 text-xs"
                    value={formData.plan} onChange={e => setFormData({...formData, plan: e.target.value})}>
                    <option>Enterprise</option><option>Standard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 mb-1">Limite de Hotéis</label>
                  <input type="number" className="w-full border border-[#999] px-2 py-1 text-xs" 
                    value={formData.max_hotels} onChange={e => setFormData({...formData, max_hotels: parseInt(e.target.value) || 1})} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 mb-1">Limite de POS</label>
                  <input type="number" className="w-full border border-[#999] px-2 py-1 text-xs" 
                    value={formData.max_pos} onChange={e => setFormData({...formData, max_pos: parseInt(e.target.value) || 1})} />
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold border-b border-[#eee] pb-1">5. Tudo Pronto para o Deploy!</h2>
              <div className="bg-[#f9f9f9] border border-[#ccc] p-4 text-[11px] max-h-60 overflow-y-auto">
                <ul className="space-y-1">
                  <li><span className="text-[#90c040] font-bold">✓</span> Criar Cliente: {formData.commercial_name || 'Novo Cliente'}</li>
                  <li><span className="text-[#90c040] font-bold">✓</span> Configurar Limites ({formData.max_hotels} Hotéis, {formData.max_pos} POS)</li>
                  <li><span className="text-[#90c040] font-bold">✓</span> Ativar Módulos e Sub-funcionalidades:</li>
                  <ul className="pl-4 pb-2 space-y-1 border-l border-[#ccc] ml-2 mt-1">
                    {Object.entries(selectedModules).map(([modId, subs]) => (
                      <li key={modId}>
                        <span className="font-bold text-gray-700">{AVAILABLE_MODULES.find(m => m.id === modId)?.name || modId}</span>
                        {subs.length > 0 ? (
                          <div className="text-[9px] text-gray-500 pl-2">
                            {subs.join(', ')}
                          </div>
                        ) : (
                          <div className="text-[9px] text-red-500 pl-2">(Nenhuma sub-funcionalidade)</div>
                        )}
                      </li>
                    ))}
                  </ul>
                  <li><span className="text-[#90c040] font-bold">✓</span> Gerar Chave Criptografada (Validade: 1 Ano)</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Controls (System Toolbar Style) */}
      <div className="bg-[#e0e0e0] border-t border-[#b0b0b0] p-1 flex justify-between items-center text-[11px]">
        <div className="flex space-x-4 px-2">
          <button 
            onClick={handleBack} 
            disabled={step === 1 || loading}
            className="flex items-center space-x-1 hover:bg-[#d0d0d0] px-2 py-1 rounded disabled:opacity-50"
          >
            <div className="w-5 h-5 rounded-full border-2 border-[#555] flex justify-center items-center font-bold text-[#555] bg-transparent pb-[2px]">
              &lt;
            </div>
            <span className="text-gray-700 font-medium ml-1">Anterior</span>
          </button>
          
          {step < steps.length ? (
            <button 
              onClick={handleNext} 
              className="flex items-center space-x-1 hover:bg-[#d0d0d0] px-2 py-1 rounded"
            >
              <div className="w-5 h-5 rounded-full border-2 border-transparent flex justify-center items-center bg-[#5bc0de] text-white">
                <ChevronRight size={12} strokeWidth={3} />
              </div>
              <span className="text-gray-700 font-medium ml-1">Próximo</span>
            </button>
          ) : (
            <button 
              onClick={handleProvision} 
              disabled={loading}
              className="flex items-center space-x-1 hover:bg-[#d0d0d0] px-2 py-1 rounded"
            >
              <div className="w-5 h-5 rounded-full border-2 border-transparent flex justify-center items-center bg-[#5cb85c] text-white font-bold pb-[2px]">
                +
              </div>
              <span className="text-gray-700 font-medium ml-1">
                {loading ? "A processar..." : "Adicionar / Criar Plataforma"}
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center px-2">
          <button className="flex items-center space-x-1 hover:bg-[#d0d0d0] px-2 py-1 rounded">
            <div className="w-5 h-5 rounded-full border-2 border-[#333] flex justify-center items-center bg-[#f0ad4e] text-black font-bold pb-[2px]">
              x
            </div>
            <span className="text-gray-700 font-medium ml-1">Fechar</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Wizard;
