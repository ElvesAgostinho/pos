import React, { useState, useEffect } from 'react';
import { apiClient as axios } from '../api/client';
import { ChevronRight } from 'lucide-react';

const API = 'http://localhost:8000/api';

interface ModuleDef {
  code: string;
  name: string;
  category: string;
  description?: string;
  is_core: boolean;
}

const Wizard: React.FC = () => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');

  // Catálogo canónico vindo do backend (fonte única partilhada com o ERP)
  const [catalog, setCatalog] = useState<ModuleDef[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  // Funcionalidades (feature flags) — licenciamento dentro do módulo
  const [featureCatalog, setFeatureCatalog] = useState<any[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    commercial_name: '',
    nif: '',
    country: 'Angola',
    general_email: '',
    plan: 'Enterprise',
    max_hotels: 5,
    max_pos: 20,
  });

  useEffect(() => {
    axios.get<ModuleDef[]>(`${API}/clm/modules/`)
      .then((res) => {
        setCatalog(res.data);
        // Pré-selecionar um conjunto sensato de módulos opcionais
        const defaults = ['inventory', 'esm', 'pos', 'wms'];
        setSelected(res.data.filter((m) => !m.is_core && defaults.includes(m.code)).map((m) => m.code));
      })
      .catch((e) => console.error('Erro ao carregar catálogo de módulos', e));
    axios.get<any[]>(`${API}/clm/features/`)
      .then((res) => {
        setFeatureCatalog(res.data);
        // Pré-selecionar as funcionalidades "de base" (default_on); premium ficam por ativar.
        setSelectedFeatures(res.data.filter((f) => f.default_on).map((f) => f.key));
      })
      .catch((e) => console.error('Erro ao carregar catálogo de funcionalidades', e));
  }, []);

  const steps = ['Dados Gerais', 'Empresa e Hotel', 'Módulos', 'Funcionalidades', 'Licença', 'Resumo'];
  const toggleFeature = (key: string) =>
    setSelectedFeatures((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const featuresByModule = featureCatalog.reduce<Record<string, any[]>>((acc, f) => {
    (acc[f.module] = acc[f.module] || []).push(f); return acc;
  }, {});
  const handleNext = () => setStep((p) => Math.min(p + 1, steps.length));
  const handleBack = () => setStep((p) => Math.max(p - 1, 1));

  const toggle = (code: string) =>
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const coreModules = catalog.filter((m) => m.is_core);
  const optionalByCategory = catalog
    .filter((m) => !m.is_core)
    .reduce<Record<string, ModuleDef[]>>((acc, m) => {
      (acc[m.category] = acc[m.category] || []).push(m);
      return acc;
    }, {});

  const handleProvision = async () => {
    setLoading(true);
    try {
      // Usa a ação de provisionamento: cria cliente + licença assinada e devolve a license.key
      // (base64) que o cliente instala no ERP local para ativar exatamente estes módulos.
      const res = await axios.post(`${API}/clm/clients/provision/`, {
        client_data: {
          code: `CLI-${Math.floor(Math.random() * 10000)}`,
          commercial_name: formData.commercial_name || 'Novo Cliente',
          nif: formData.nif || null,
        },
        commercial_data: { plan: formData.plan },
        // Emite os CÓDIGOS CANÓNICOS — correspondem 1:1 às apps do ERP.
        modules: [...coreModules.map((m) => m.code), ...selected],
        // Allow/deny explícito por funcionalidade (allowed = keys a true).
        feature_flags: Object.fromEntries(featureCatalog.map((f) => [f.key, selectedFeatures.includes(f.key)])),
        limits: { hotels: formData.max_hotels, pos: formData.max_pos },
      });

      setLicenseKey(res.data.license_key || 'Chave gerada no backend...');
      setSuccess(true);
    } catch (err) {
      console.error('Error provisioning:', err);
      alert('Erro ao provisionar cliente. Verifique a consola.');
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
          </div>
          <div className="flex mb-4">
            <div className="w-12 h-12 bg-[#90c040] text-white flex justify-center items-center font-bold text-2xl border border-black mr-4">✓</div>
            <div>
              <p className="font-bold mb-1">O cliente foi provisionado com sucesso na Cloud (PCC).</p>
              <p className="text-gray-600 text-[10px] mb-2">
                Módulos ativados: <b>{selected.join(', ') || '—'}</b>. Copie a chave para instalar o ERP no servidor do cliente.
              </p>
            </div>
          </div>
          <div className="bg-white border border-[#999] p-2 mb-4">
            <code className="text-[10px] text-gray-800 break-all select-all block mb-2">{licenseKey}</code>
          </div>
          <div className="flex justify-end border-t border-[#ccc] pt-2 mt-2">
            <button onClick={() => { setSuccess(false); setStep(1); }} className="px-4 py-1 border border-[#333] bg-[#333] text-white hover:bg-[#444]">
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

      <div className="flex-1 bg-white overflow-auto">
        <div className="p-4">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold border-b border-[#eee] pb-1">1. Dados da Entidade</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 mb-1">Nome Comercial</label>
                  <input type="text" className="w-full border border-[#999] px-2 py-1 text-xs" placeholder="Ex: Grupo Pestana"
                    value={formData.commercial_name} onChange={(e) => setFormData({ ...formData, commercial_name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 mb-1">NIF</label>
                  <input type="text" className="w-full border border-[#999] px-2 py-1 text-xs" placeholder="Ex: 500123456"
                    value={formData.nif} onChange={(e) => setFormData({ ...formData, nif: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 mb-1">País</label>
                  <select className="w-full border border-[#999] px-2 py-1 text-xs"
                    value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })}>
                    <option>Angola</option><option>Portugal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 mb-1">E-mail de Contacto</label>
                  <input type="email" className="w-full border border-[#999] px-2 py-1 text-xs"
                    value={formData.general_email} onChange={(e) => setFormData({ ...formData, general_email: e.target.value })} />
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
              <h2 className="text-sm font-bold border-b border-[#eee] pb-1">3. Ativação de Módulos</h2>
              <p className="text-[10px] text-gray-500">
                Cada módulo corresponde a uma aplicação real do ERP. O que ativar aqui é o que arranca no servidor do cliente.
              </p>

              {/* Núcleo (sempre incluído) */}
              <div className="border border-[#ccc] bg-[#f4f9ee]">
                <div className="px-2 py-1 bg-[#e8f2dc] text-[10px] font-bold text-[#4a6a25] border-b border-[#d5e5c0]">
                  NÚCLEO (sempre incluído)
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1 p-2">
                  {coreModules.map((m) => (
                    <label key={m.code} className="flex items-center opacity-70">
                      <input type="checkbox" className="mr-2" checked disabled />
                      <span className="text-[10px] text-gray-700">{m.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Opcionais por categoria */}
              {Object.entries(optionalByCategory).map(([cat, mods]) => (
                <div key={cat} className="border border-[#ccc] bg-[#f9f9f9]">
                  <div className="px-2 py-1 bg-[#eee] text-[10px] font-bold text-[#333] border-b border-[#ddd] uppercase tracking-wide">
                    {cat}
                  </div>
                  <div className="p-2 space-y-1">
                    {mods.map((m) => (
                      <label key={m.code} className="flex items-start p-1 hover:bg-[#e6f2ff] cursor-pointer rounded">
                        <input type="checkbox" className="mr-2 mt-0.5" checked={selected.includes(m.code)} onChange={() => toggle(m.code)} />
                        <div>
                          <span className="font-bold text-[#333]">{m.name}</span>
                          <span className="ml-2 text-[9px] text-gray-400 font-mono">[{m.code}]</span>
                          {m.description && <div className="text-[9px] text-gray-500">{m.description}</div>}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold border-b border-[#eee] pb-1">4. Funcionalidades (Premium & Base)</h2>
              <p className="text-[10px] text-gray-500">
                Dentro de cada módulo, escolha as funcionalidades incluídas nesta licença. As desativadas não aparecem no ERP do cliente.
              </p>
              {Object.entries(featuresByModule).map(([mod, feats]) => (
                <div key={mod} className="border border-[#ccc] bg-[#f9f9f9]">
                  <div className="px-2 py-1 bg-[#eee] text-[10px] font-bold text-[#333] border-b border-[#ddd] uppercase tracking-wide">{mod}</div>
                  <div className="p-2 space-y-1">
                    {feats.map((f: any) => (
                      <label key={f.key} className="flex items-start p-1 hover:bg-[#e6f2ff] cursor-pointer rounded">
                        <input type="checkbox" className="mr-2 mt-0.5" checked={selectedFeatures.includes(f.key)} onChange={() => toggleFeature(f.key)} />
                        <div>
                          <span className="font-bold text-[#333]">{f.name}</span>
                          <span className="ml-2 text-[9px] text-gray-400 font-mono">[{f.key}]</span>
                          {!f.default_on && <span className="ml-2 text-[8px] font-bold text-[#b06a00] bg-[#fff4d6] px-1 rounded">PREMIUM</span>}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {featureCatalog.length === 0 && <div className="text-[10px] text-gray-500">Sem funcionalidades no catálogo.</div>}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold border-b border-[#eee] pb-1">5. Detalhes da Licença</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 mb-1">Plano Contratado</label>
                  <select className="w-full border border-[#999] px-2 py-1 text-xs"
                    value={formData.plan} onChange={(e) => setFormData({ ...formData, plan: e.target.value })}>
                    <option>Enterprise</option><option>Standard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 mb-1">Limite de Hotéis</label>
                  <input type="number" className="w-full border border-[#999] px-2 py-1 text-xs"
                    value={formData.max_hotels} onChange={(e) => setFormData({ ...formData, max_hotels: parseInt(e.target.value) || 1 })} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-700 mb-1">Limite de POS</label>
                  <input type="number" className="w-full border border-[#999] px-2 py-1 text-xs"
                    value={formData.max_pos} onChange={(e) => setFormData({ ...formData, max_pos: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold border-b border-[#eee] pb-1">6. Tudo Pronto para o Deploy!</h2>
              <div className="bg-[#f9f9f9] border border-[#ccc] p-4 text-[11px] max-h-60 overflow-y-auto">
                <ul className="space-y-1">
                  <li><span className="text-[#90c040] font-bold">✓</span> Criar Cliente: {formData.commercial_name || 'Novo Cliente'}</li>
                  <li><span className="text-[#90c040] font-bold">✓</span> Limites: {formData.max_hotels} Hotéis, {formData.max_pos} POS</li>
                  <li><span className="text-[#90c040] font-bold">✓</span> Módulos opcionais ativados ({selected.length}):</li>
                  <ul className="pl-4 pb-2 border-l border-[#ccc] ml-2 mt-1">
                    {selected.map((code) => (
                      <li key={code} className="text-[10px] text-gray-700">
                        {catalog.find((m) => m.code === code)?.name} <span className="text-gray-400 font-mono">[{code}]</span>
                      </li>
                    ))}
                    {selected.length === 0 && <li className="text-[10px] text-red-500">(Nenhum módulo opcional selecionado)</li>}
                  </ul>
                  <li><span className="text-[#90c040] font-bold">✓</span> Funcionalidades incluídas ({selectedFeatures.length}/{featureCatalog.length}):</li>
                  <ul className="pl-4 pb-2 border-l border-[#ccc] ml-2 mt-1">
                    {selectedFeatures.map((k) => (
                      <li key={k} className="text-[10px] text-gray-700">{featureCatalog.find((f) => f.key === k)?.name} <span className="text-gray-400 font-mono">[{k}]</span></li>
                    ))}
                  </ul>
                  <li><span className="text-[#90c040] font-bold">✓</span> Gerar Chave Criptografada (Validade: 1 Ano)</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Controls */}
      <div className="bg-[#e0e0e0] border-t border-[#b0b0b0] p-1 flex justify-between items-center text-[11px]">
        <div className="flex space-x-4 px-2">
          <button onClick={handleBack} disabled={step === 1 || loading}
            className="flex items-center space-x-1 hover:bg-[#d0d0d0] px-2 py-1 rounded disabled:opacity-50">
            <div className="w-5 h-5 rounded-full border-2 border-[#555] flex justify-center items-center font-bold text-[#555] pb-[2px]">&lt;</div>
            <span className="text-gray-700 font-medium ml-1">Anterior</span>
          </button>

          {step < steps.length ? (
            <button onClick={handleNext} className="flex items-center space-x-1 hover:bg-[#d0d0d0] px-2 py-1 rounded">
              <div className="w-5 h-5 rounded-full flex justify-center items-center bg-[#5bc0de] text-white">
                <ChevronRight size={12} strokeWidth={3} />
              </div>
              <span className="text-gray-700 font-medium ml-1">Próximo</span>
            </button>
          ) : (
            <button onClick={handleProvision} disabled={loading} className="flex items-center space-x-1 hover:bg-[#d0d0d0] px-2 py-1 rounded">
              <div className="w-5 h-5 rounded-full flex justify-center items-center bg-[#5cb85c] text-white font-bold pb-[2px]">+</div>
              <span className="text-gray-700 font-medium ml-1">{loading ? 'A processar...' : 'Adicionar / Criar Plataforma'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Wizard;
