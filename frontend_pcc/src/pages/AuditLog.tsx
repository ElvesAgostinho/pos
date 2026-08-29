import React, { useEffect, useState } from 'react';
import { apiClient as axios } from '../api/client';
import { RefreshCcw, ShieldAlert } from 'lucide-react';

// TRILHO DE AUDITORIA — quem fez o quê no PCC (provisionar cliente, gerar
// acessos, ativação remota falhada, código de reposição usado, etc.). Só
// leitura: o PCC deve gerir tudo por aqui, não pelo admin do Django.
function tempoRelativo(iso?: string | null) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.round(h / 24);
  return `há ${d} dia(s)`;
}

// Ações que representam uma FALHA (tentativa incorreta) — destacadas a vermelho,
// para saltarem à vista numa lista que é maioritariamente rotina.
const ACOES_FALHA = new Set(['REMOTE_ACTIVATION_FAILED', 'OWNER_PASSWORD_RESET_FAILED']);

const ACTION_LABEL: Record<string, string> = {
  CREATE_CLIENT_PROVISIONING: 'Cliente provisionado',
  REGENERATE_INSTALL_PASSWORD: 'Senha de instalação gerada',
  REGENERATE_OWNER_PASSWORD: 'Senha do dono gerada',
  GENERATE_OWNER_RESET_CODE: 'Código de reposição gerado',
  OWNER_PASSWORD_RESET_USED: 'Password reposta pelo dono',
  OWNER_PASSWORD_RESET_FAILED: 'Reposição de password falhou',
  LICENSE_SYNC_PULL: 'Sincronização de licença',
  REMOTE_ACTIVATION_OK: 'Ativação remota',
  REMOTE_ACTIVATION_FAILED: 'Ativação remota falhou',
};

const AuditLog: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await axios.get('clm/audits/', { params: search ? { search } : {} });
      setLogs(res.data?.results || res.data || []);
    } catch (err) {
      console.error('Error fetching audit log:', err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchLogs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full bg-[#f0f0f0] text-black font-sans text-[11px] select-none">
      <div className="flex items-center px-2 py-1 bg-[#e0e0e0] border-b border-[#a0a0a0] gap-3">
        <span className="mr-2 text-gray-700 font-bold">Auditoria</span>
        <div className="flex bg-white border border-[#999] h-[18px]">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchLogs()}
            className="px-1 text-[11px] outline-none w-56" placeholder="Pesquisar ação ou utilizador..." />
        </div>
        <span className="text-gray-400">{logs.length} registos</span>
        <button onClick={fetchLogs} disabled={loading}
          className="ml-auto flex items-center gap-1 px-2 py-0.5 border border-[#a0a0a0] bg-white hover:bg-[#e8e8e8] disabled:opacity-50">
          <RefreshCcw size={11} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      <div className="flex-1 bg-white overflow-auto border-b border-[#a0a0a0]">
        <table className="w-full text-left border-collapse cursor-default">
          <thead>
            <tr className="bg-gradient-to-b from-[#ffffff] to-[#e0e0e0] border-b border-[#a0a0a0] text-gray-700">
              <th className="py-1 px-2 border-r border-[#ccc] font-normal w-36">Quando</th>
              <th className="py-1 px-2 border-r border-[#ccc] font-normal w-64">Ação</th>
              <th className="py-1 px-2 border-r border-[#ccc] font-normal w-40">Por</th>
              <th className="py-1 px-2 font-normal">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} onClick={() => setSelected(l)}
                className={`border-b border-[#eee] hover:bg-[#cce8ff] cursor-pointer ${ACOES_FALHA.has(l.action) ? 'bg-red-50' : ''}`}>
                <td className="py-1 px-2 border-r border-[#eee] whitespace-nowrap" title={l.timestamp}>{tempoRelativo(l.timestamp)}</td>
                <td className="py-1 px-2 border-r border-[#eee]">
                  <span className={ACOES_FALHA.has(l.action) ? 'text-red-700 font-bold flex items-center gap-1' : ''}>
                    {ACOES_FALHA.has(l.action) && <ShieldAlert size={11} />}
                    {ACTION_LABEL[l.action] || l.action}
                  </span>
                </td>
                <td className="py-1 px-2 border-r border-[#eee]">{l.user_identity}</td>
                <td className="py-1 px-2 truncate max-w-[1px] text-gray-600">
                  {l.details ? JSON.stringify(l.details) : ''}
                </td>
              </tr>
            ))}
            {logs.length === 0 && !loading && (
              <tr><td colSpan={4} className="py-8 text-center text-gray-400">Sem registos.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setSelected(null)}>
          <div className="bg-[#f0f0f0] border border-[#a0a0a0] w-[520px] shadow-md flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#333] text-white px-2 py-1 flex justify-between items-center">
              <span className="font-bold text-[11px]">{ACTION_LABEL[selected.action] || selected.action}</span>
              <button onClick={() => setSelected(null)} className="hover:text-red-400 font-bold">×</button>
            </div>
            <div className="p-4 bg-white space-y-2 text-[11px]">
              <div><span className="text-gray-500">Quando:</span> {new Date(selected.timestamp).toLocaleString('pt-PT')}</div>
              <div><span className="text-gray-500">Por:</span> {selected.user_identity}</div>
              <pre className="bg-[#f7f7f7] border border-[#ddd] p-2 mt-2 whitespace-pre-wrap break-all text-[10px]">
                {JSON.stringify(selected.details, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLog;
