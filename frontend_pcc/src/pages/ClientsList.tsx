import React, { useEffect, useState } from 'react';
import { apiClient as axios } from '../api/client';
import { Settings, Key, CheckCircle, X, Monitor, Lock, Wifi, WifiOff, Trash2 } from 'lucide-react';

// A sincronização é manual (o cliente clica "Sincronizar com o PCC" no
// Suporte dele) — não é um heartbeat automático. Por isso "sincronizado
// recentemente" (< 6h), não "online" a sério — não fingimos uma ligação
// permanente que não existe.
function tempoRelativo(iso?: string | null) {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.round(h / 24);
  return `há ${d} dia(s)`;
}

const ClientsList: React.FC = () => {
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);

  const [showProvModal, setShowProvModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedLicense, setGeneratedLicense] = useState<{terminal_id: string, activation_key: string} | null>(null);
  const [assetType, setAssetType] = useState<'POS' | 'KIOSK'>('POS');
  const [search, setSearch] = useState('');

  // ── Acessos (senha de instalação / senha do dono) da licença ativa do cliente ──
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [accessBusy, setAccessBusy] = useState<'' | 'install' | 'owner'>('');
  const [accessResult, setAccessResult] = useState<{ kind: string; username?: string; password: string } | null>(null);

  // ── Ver/recuperar o license.key de uma licença já existente ──
  const [keyBusy, setKeyBusy] = useState<number | null>(null);
  const [keyResult, setKeyResult] = useState<{ license_number: string; client_code: string; license_key: string } | null>(null);

  const verLicenseKey = async (licenseId: number) => {
    setKeyBusy(licenseId);
    try {
      const r = await axios.get(`clm/licenses/${licenseId}/key/`);
      setKeyResult(r.data);
    } catch {
      alert('Erro ao obter o license.key.');
    } finally {
      setKeyBusy(null);
    }
  };

  const descarregarLicenseKey = () => {
    if (!keyResult) return;
    const blob = new Blob([keyResult.license_key], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'license.key';
    a.click();
    URL.revokeObjectURL(url);
  };

  const fetchClients = async () => {
    try {
      const res = await axios.get('clm/clients/');
      setClients(res.data);
      // mantém a seleção viva, mas com os dados frescos (has_install_password, etc.)
      setSelectedClient((cur: any) => cur ? res.data.find((c: any) => c.id === cur.id) || cur : cur);
    } catch (err) {
      console.error("Error fetching clients:", err);
    }
  };
  useEffect(() => { fetchClients(); }, []);

  // A licença mais recente do cliente selecionado — é nela que os acessos vivem.
  const activeLicense = selectedClient?.licenses?.length
    ? [...selectedClient.licenses].sort((a: any, b: any) => b.id - a.id)[0] : null;

  const regenerateAccess = async (kind: 'install' | 'owner') => {
    if (!activeLicense) return;
    setAccessBusy(kind);
    setAccessResult(null);
    try {
      const r = await axios.post(`clm/licenses/${activeLicense.id}/regenerate-access/`, { kind });
      setAccessResult(r.data);
      await fetchClients();
    } catch (err) {
      console.error('Error regenerating access:', err);
      alert('Erro ao gerar a senha.');
    } finally {
      setAccessBusy('');
    }
  };

  // ── Apagar instalações/licenças antigas ──
  const apagarInstalacao = async (id: number, nome: string) => {
    if (!confirm(`Apagar a instalação "${nome}"? Deixa de mostrar o estado de sincronização dela.`)) return;
    try {
      await axios.delete(`clm/installations/${id}/`);
      await fetchClients();
    } catch {
      alert('Erro ao apagar a instalação.');
    }
  };

  const apagarLicenca = async (lic: any) => {
    const ativa = lic.id === activeLicense?.id;
    const aviso = ativa
      ? `"${lic.license_number}" é a licença ATIVA deste cliente — apagá-la pode impedir a próxima sincronização e perder os acessos gerados nela. Apagar mesmo assim?`
      : `Apagar a licença "${lic.license_number}"?`;
    if (!confirm(aviso)) return;
    try {
      await axios.delete(`clm/licenses/${lic.id}/`);
      await fetchClients();
    } catch {
      alert('Erro ao apagar a licença.');
    }
  };

  // Apaga o cliente por inteiro — em cascata (CASCADE no modelo) leva consigo
  // TODAS as instalações e licenças dele; sem licença, o servidor do cliente
  // deixa de conseguir validar/sincronizar (fica preso na última que tinha
  // offline, mas nunca mais renova). É irreversível, por isso pede o código
  // do cliente escrito à mão — não basta um "sim".
  const apagarCliente = async () => {
    if (!selectedClient) return;
    const confirmacao = prompt(
      `Isto apaga "${selectedClient.commercial_name}" por inteiro — cliente, todas as instalações e todas as licenças (inválida a partir de agora). Não há como desfazer.\n\nEscreva o código do cliente para confirmar: ${selectedClient.code}`
    );
    if (confirmacao !== selectedClient.code) {
      if (confirmacao !== null) alert('Código não coincide — nada foi apagado.');
      return;
    }
    try {
      await axios.delete(`clm/clients/${selectedClient.id}/`);
      setSelectedClient(null);
      await fetchClients();
    } catch {
      alert('Erro ao apagar o cliente.');
    }
  };

  const handleGenerateTerminal = async () => {
    if (!selectedClient) return;
    
    setGenerating(true);
    
    try {
      const terminalId = `POS-${Math.floor(100000 + Math.random() * 900000)}`;
      const segment = () => Math.random().toString(36).substring(2, 6).toUpperCase();
      const activationKey = `${segment()}-${segment()}-${segment()}-${segment()}`;

      // Create TerminalLicense in Django
      await axios.post('clm/terminals/', {
        client: selectedClient.id,
        terminal_id: terminalId,
        activation_key: activationKey,
        asset_type: assetType,
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
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            className="px-1 text-[11px] outline-none w-48" placeholder="Pesquisar..." />
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
              <th className="py-1 px-2 border-r border-[#ccc] font-normal w-32 text-center">Sincronização</th>
              <th className="py-1 px-2 font-normal w-24 text-center">Ativo</th>
            </tr>
          </thead>
          <tbody>
            {clients.filter((c) => {
              const q = search.trim().toLowerCase();
              if (!q) return true;
              return (c.code || '').toLowerCase().includes(q) || (c.commercial_name || '').toLowerCase().includes(q);
            }).map((client, i) => {
              const insts = client.installations || [];
              const ultima = insts.reduce((max: any, x: any) => (!max || (x.last_ping && x.last_ping > max.last_ping)) ? x : max, null);
              return (
              <tr
                key={client.id || i}
                onClick={() => setSelectedClient(client)}
                className={`border-b border-[#eee] hover:bg-[#cce8ff] ${selectedClient?.id === client.id ? 'bg-[#cce8ff]' : ''}`}
              >
                <td className="py-1 px-2 border-r border-[#eee]">{client.code}</td>
                <td className="py-1 px-2 border-r border-[#eee]">{client.commercial_name}</td>
                <td className="py-1 px-2 border-r border-[#eee] text-center">{client.country}</td>
                <td className="py-1 px-2 border-r border-[#eee] text-center">
                  {ultima?.last_ping ? (
                    <span className={`inline-flex items-center gap-1 ${ultima.is_online ? 'text-green-700' : 'text-gray-500'}`} title={ultima.last_ping}>
                      {ultima.is_online ? <Wifi size={11} /> : <WifiOff size={11} />} {tempoRelativo(ultima.last_ping)}
                    </span>
                  ) : <span className="text-gray-400">nunca</span>}
                </td>
                <td className="py-1 px-2 text-center">
                  {client.status === 'ACTIVE' ? (
                    <span className="text-green-600 font-bold text-sm leading-none">✓</span>
                  ) : <span className="text-gray-400">-</span>}
                </td>
              </tr>
              );
            })}
            {/* Empty rows to fill space */}
            {Array.from({ length: Math.max(0, 15 - clients.length) }).map((_, i) => (
              <tr key={`empty-${i}`} className="border-b border-[#eee]">
                <td className="py-3 px-2 border-r border-[#eee]"></td>
                <td className="py-3 px-2 border-r border-[#eee]"></td>
                <td className="py-3 px-2 border-r border-[#eee]"></td>
                <td className="py-3 px-2 border-r border-[#eee]"></td>
                <td className="py-3 px-2"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedClient && (
        <div className="px-2 py-1.5 bg-white border-b border-[#a0a0a0] text-[11px] flex items-center gap-4 flex-wrap">
          <span className="font-bold text-gray-600">Instalações — {selectedClient.commercial_name}:</span>
          {(selectedClient.installations || []).length === 0 ? (
            <span className="text-gray-400">Ainda nenhuma sincronização recebida deste cliente.</span>
          ) : (selectedClient.installations || []).map((inst: any) => (
            <span key={inst.id} className={`inline-flex items-center gap-1 px-2 py-0.5 border ${inst.is_online ? 'border-green-300 bg-green-50 text-green-700' : 'border-[#ddd] bg-[#f5f5f5] text-gray-500'}`}>
              {inst.is_online ? <Wifi size={11} /> : <WifiOff size={11} />}
              <b>{inst.name}</b>{inst.server_ip ? ` · ${inst.server_ip}` : ''} · {tempoRelativo(inst.last_ping) || 'nunca sincronizou'}
              <button onClick={() => apagarInstalacao(inst.id, inst.name)} title="Apagar esta instalação"
                className="text-gray-400 hover:text-red-600 ml-1"><Trash2 size={10} /></button>
            </span>
          ))}
        </div>
      )}

      {selectedClient && (selectedClient.licenses || []).length > 0 && (
        <div className="px-2 py-1.5 bg-white border-b border-[#a0a0a0] text-[11px] flex items-center gap-4 flex-wrap">
          <span className="font-bold text-gray-600">Licenças — {selectedClient.commercial_name}:</span>
          {[...selectedClient.licenses].sort((a: any, b: any) => b.id - a.id).map((lic: any) => (
            <span key={lic.id} className={`inline-flex items-center gap-1 px-2 py-0.5 border ${lic.id === activeLicense?.id ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-[#ddd] bg-[#f5f5f5] text-gray-500'}`}>
              {lic.id === activeLicense?.id && <span className="font-bold">ATIVA ·</span>}
              <b>{lic.license_number}</b> · {lic.plan} · {lic.created_at ? new Date(lic.created_at).toLocaleDateString('pt-PT') : '—'}
              <button onClick={() => verLicenseKey(lic.id)} disabled={keyBusy === lic.id} title="Ver / recuperar o license.key"
                className="text-gray-400 hover:text-blue-700 ml-1"><Key size={10} /></button>
              <button onClick={() => apagarLicenca(lic)} title="Apagar esta licença"
                className="text-gray-400 hover:text-red-600 ml-1"><Trash2 size={10} /></button>
            </span>
          ))}
        </div>
      )}

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

          <button
            disabled={!selectedClient}
            onClick={() => { setAccessResult(null); setShowAccessModal(true); }}
            className={`flex items-center space-x-1 px-2 py-1 rounded ${!selectedClient ? 'opacity-50' : 'hover:bg-[#d0d0d0]'}`}
          >
            <div className="w-5 h-5 rounded-full border border-transparent flex justify-center items-center bg-[#5bc0de] text-white">
              <Lock size={10} />
            </div>
            <span className="text-gray-700 ml-1 font-bold">Acessos (instalação / dono)</span>
          </button>
        </div>

        <div className="flex space-x-4 px-2">
          <button
            disabled={!selectedClient}
            onClick={apagarCliente}
            title="Apaga o cliente, todas as instalações e todas as licenças — irreversível"
            className={`flex items-center space-x-1 px-2 py-1 rounded ${!selectedClient ? 'opacity-50' : 'hover:bg-[#f5d0d0]'}`}
          >
            <div className="w-5 h-5 rounded-full border border-transparent flex justify-center items-center bg-[#c0392b] text-white">
              <Trash2 size={10} />
            </div>
            <span className="text-red-700 ml-1 font-bold">Apagar Cliente</span>
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
                    <select value={assetType} onChange={(e) => setAssetType(e.target.value as 'POS' | 'KIOSK')}
                      className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none bg-white">
                      <option value="POS">Terminal POS Operacional</option>
                      <option value="KIOSK">Kiosk Self-Service</option>
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

      {/* Modal de ACESSOS — senha de instalação e senha do dono da licença ativa */}
      {showAccessModal && selectedClient && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-[#f0f0f0] border border-[#a0a0a0] w-[460px] shadow-md flex flex-col">
            <div className="bg-[#333] text-white px-2 py-1 flex justify-between items-center">
              <div className="flex items-center">
                <Lock size={14} className="mr-2" />
                <span className="font-bold text-[11px]">Acessos — {selectedClient.commercial_name}</span>
              </div>
              <button onClick={() => setShowAccessModal(false)} className="hover:text-red-400 font-bold">x</button>
            </div>

            <div className="p-4 bg-[#f0f0f0] flex-1 space-y-3 text-[11px] font-sans">
              {!activeLicense ? (
                <div className="bg-white border border-[#a0a0a0] p-3 text-gray-600">
                  Este cliente ainda não tem nenhuma licença — crie uma pelo assistente "Novo Cliente" primeiro.
                </div>
              ) : (
                <>
                  <div className="bg-white border border-[#a0a0a0] p-3">
                    <div className="font-bold text-gray-700 mb-1">Senha de instalação</div>
                    <div className="text-gray-500 text-[10px] mb-2">
                      A que o técnico introduz para o setup.exe deste cliente sequer arrancar.
                    </div>
                    {activeLicense.has_install_password && (
                      <div className="text-[10px] text-gray-500 mb-2">
                        ✓ Definida em {new Date(activeLicense.install_password_set_at).toLocaleString('pt-PT')}
                      </div>
                    )}
                    <button onClick={() => regenerateAccess('install')} disabled={accessBusy !== ''}
                      className="flex items-center space-x-1 hover:bg-[#d0d0d0] px-3 py-1 rounded border border-[#a0a0a0] bg-white disabled:opacity-50">
                      <Key size={11} className="text-blue-700" />
                      <span className="font-bold text-blue-800">
                        {accessBusy === 'install' ? 'A gerar…' : activeLicense.has_install_password ? 'Gerar nova (substitui a atual)' : 'Gerar senha de instalação'}
                      </span>
                    </button>
                    {accessResult?.kind === 'install' && (
                      <div className="mt-2 bg-[#fff8e1] border border-[#e0c080] p-2">
                        <div className="text-[10px] font-bold text-[#8a6100] mb-1">
                          ⚠ Só aparece agora — copie e entregue ao técnico:
                        </div>
                        <input readOnly value={accessResult.password} onClick={(e) => (e.target as HTMLInputElement).select()}
                          className="w-full border border-[#999] px-2 py-1 text-[11px] font-mono bg-white select-all" />
                      </div>
                    )}
                  </div>

                  <div className="bg-white border border-[#a0a0a0] p-3">
                    <div className="font-bold text-gray-700 mb-1">Senha do dono</div>
                    <div className="text-gray-500 text-[10px] mb-2">
                      A conta ({activeLicense.owner_username || 'dono'}) com que o dono do cliente faz o primeiro login no sistema instalado.
                    </div>
                    {activeLicense.has_owner_password && (
                      <div className="text-[10px] text-gray-500 mb-2">
                        ✓ Definida em {new Date(activeLicense.owner_password_set_at).toLocaleString('pt-PT')}
                      </div>
                    )}
                    <button onClick={() => regenerateAccess('owner')} disabled={accessBusy !== ''}
                      className="flex items-center space-x-1 hover:bg-[#d0d0d0] px-3 py-1 rounded border border-[#a0a0a0] bg-white disabled:opacity-50">
                      <Key size={11} className="text-blue-700" />
                      <span className="font-bold text-blue-800">
                        {accessBusy === 'owner' ? 'A gerar…' : activeLicense.has_owner_password ? 'Gerar nova (substitui a atual)' : 'Gerar senha do dono'}
                      </span>
                    </button>
                    {accessResult?.kind === 'owner' && (
                      <div className="mt-2 bg-[#fff8e1] border border-[#e0c080] p-2">
                        <div className="text-[10px] font-bold text-[#8a6100] mb-1">
                          ⚠ Só aparece agora — copie e entregue ao técnico:
                        </div>
                        <div className="text-[10px] text-gray-600 mb-1">Utilizador: <b>{accessResult.username}</b></div>
                        <input readOnly value={accessResult.password} onClick={(e) => (e.target as HTMLInputElement).select()}
                          className="w-full border border-[#999] px-2 py-1 text-[11px] font-mono bg-white select-all" />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="bg-[#e0e0e0] border-t border-[#b0b0b0] p-2 flex justify-end space-x-2">
              <button onClick={() => setShowAccessModal(false)}
                className="flex items-center space-x-1 hover:bg-[#d0d0d0] px-3 py-1 rounded border border-[#a0a0a0] bg-white">
                <X size={12} className="text-gray-600" />
                <span className="font-bold">Fechar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: ver/recuperar o license.key de uma licença já existente */}
      {keyResult && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-[#f0f0f0] border border-[#a0a0a0] w-[520px] shadow-md flex flex-col">
            <div className="bg-[#333] text-white px-2 py-1 flex justify-between items-center">
              <div className="flex items-center">
                <Key size={14} className="mr-2" />
                <span className="font-bold text-[11px]">license.key — {keyResult.license_number}</span>
              </div>
              <button onClick={() => setKeyResult(null)} className="hover:text-red-400 font-bold">x</button>
            </div>
            <div className="p-4 bg-[#f0f0f0] flex-1 space-y-3 text-[11px] font-sans">
              <div className="bg-white border border-[#a0a0a0] p-3">
                <div className="text-gray-600 mb-2">
                  Copie o conteúdo abaixo (ou descarregue) e coloque-o, sem alterar nada, em{' '}
                  <code className="bg-gray-100 px-1">{'{pasta da instalação}'}\app\license.key</code> do cliente{' '}
                  <b>{keyResult.client_code}</b>. O servidor deteta sozinho em poucos segundos.
                </div>
                <textarea readOnly value={keyResult.license_key} rows={6}
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  className="w-full border border-[#999] px-2 py-1 text-[10px] font-mono bg-white select-all break-all" />
              </div>
            </div>
            <div className="bg-[#e0e0e0] border-t border-[#b0b0b0] p-2 flex justify-end space-x-2">
              <button onClick={descarregarLicenseKey}
                className="flex items-center space-x-1 hover:bg-[#d0d0d0] px-3 py-1 rounded border border-[#a0a0a0] bg-white">
                <Key size={12} className="text-blue-700" />
                <span className="font-bold text-blue-800">Descarregar license.key</span>
              </button>
              <button onClick={() => setKeyResult(null)}
                className="flex items-center space-x-1 hover:bg-[#d0d0d0] px-3 py-1 rounded border border-[#a0a0a0] bg-white">
                <X size={12} className="text-gray-600" />
                <span className="font-bold">Fechar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientsList;
