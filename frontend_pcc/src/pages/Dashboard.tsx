import React, { useEffect, useState } from 'react';
import { apiClient as axios } from '../api/client';
import { Users, ShieldCheck, FlaskConical, KeyRound, Wifi, WifiOff } from 'lucide-react';

const tempoRelativo = (iso?: string | null) => {
  if (!iso) return null;
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h}h` : `há ${Math.round(h / 24)} dia(s)`;
};

/** Dashboard PCC — números reais (clm.ClientViewSet.dashboard_stats, já
 * existia no backend e nunca tinha sido usado) + as últimas sincronizações.
 * Antes disto era uma cópia estática da lista de clientes com botões
 * Adicionar/Editar/Apagar que não faziam nada — essa gestão a sério já vive
 * em "Gestão de Clientes"; aqui fica só um resumo, sem duplicar. */
const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<{ total_clients: number; active_clients: number; trial_clients: number; total_licenses: number } | null>(null);
  const [clients, setClients] = useState<any[]>([]);

  useEffect(() => {
    axios.get('clm/clients/dashboard_stats/').then((r) => setStats(r.data)).catch(() => {});
    axios.get('clm/clients/').then((r) => setClients(r.data || [])).catch(() => {});
  }, []);

  const recentes = [...clients]
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, 8);

  const Tile = ({ icon: Icon, label, value, color }: any) => (
    <div className="bg-white border border-[#a0a0a0] p-3 flex items-center gap-3 min-w-[180px]">
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: color }}>
        <Icon size={16} />
      </div>
      <div>
        <div className="text-[20px] font-bold leading-none">{value ?? '—'}</div>
        <div className="text-[11px] text-gray-500">{label}</div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[#f0f0f0] text-black font-sans text-[11px] select-none overflow-auto">
      <div className="flex items-center px-2 py-1 bg-[#e0e0e0] border-b border-[#a0a0a0]">
        <span className="text-gray-700 font-bold">Dashboard PCC</span>
      </div>

      <div className="p-4 flex gap-3 flex-wrap">
        <Tile icon={Users} label="Clientes" value={stats?.total_clients} color="#2b6cb0" />
        <Tile icon={ShieldCheck} label="Clientes ativos" value={stats?.active_clients} color="#2f9e44" />
        <Tile icon={FlaskConical} label="Em trial" value={stats?.trial_clients} color="#e8a33d" />
        <Tile icon={KeyRound} label="Licenças emitidas" value={stats?.total_licenses} color="#6a3fa0" />
      </div>

      <div className="px-4 pb-4">
        <div className="bg-white border border-[#a0a0a0]">
          <div className="px-2 py-1.5 font-bold text-gray-700 bg-[#e8e8e8] border-b border-[#a0a0a0]">Clientes recentes</div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f4f4f4] border-b border-[#a0a0a0] text-gray-700">
                <th className="py-1 px-2 border-r border-[#eee] font-normal w-24">Código</th>
                <th className="py-1 px-2 border-r border-[#eee] font-normal">Nome</th>
                <th className="py-1 px-2 border-r border-[#eee] font-normal w-32 text-center">Ativo</th>
                <th className="py-1 px-2 font-normal w-40 text-center">Sincronização</th>
              </tr>
            </thead>
            <tbody>
              {recentes.map((c) => {
                const insts = c.installations || [];
                const ultima = insts.reduce((max: any, x: any) => (!max || (x.last_ping && x.last_ping > max.last_ping)) ? x : max, null);
                return (
                  <tr key={c.id} className="border-b border-[#eee] hover:bg-[#f5f5f5]">
                    <td className="py-1 px-2 border-r border-[#eee]">{c.code}</td>
                    <td className="py-1 px-2 border-r border-[#eee]">{c.commercial_name}</td>
                    <td className="py-1 px-2 border-r border-[#eee] text-center">
                      {c.status === 'ACTIVE' ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="py-1 px-2 text-center">
                      {ultima?.last_ping ? (
                        <span className={`inline-flex items-center gap-1 ${ultima.is_online ? 'text-green-700' : 'text-gray-500'}`}>
                          {ultima.is_online ? <Wifi size={11} /> : <WifiOff size={11} />} {tempoRelativo(ultima.last_ping)}
                        </span>
                      ) : <span className="text-gray-400">nunca</span>}
                    </td>
                  </tr>
                );
              })}
              {recentes.length === 0 && (
                <tr><td colSpan={4} className="py-4 px-2 text-center text-gray-400">Ainda sem clientes.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
