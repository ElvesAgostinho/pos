import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { LogIn, LogOut, BedDouble, AlertTriangle, DoorOpen, Users } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });

/**
 * BALCÃO DE RECEÇÃO — o dia de trabalho do rececionista (não é a lista de reservas).
 * Chegadas de hoje · Hóspedes em casa · Saídas de hoje, com os BLOQUEIOS à vista
 * (quarto por atribuir, quarto por limpar, conta em aberto) e a ação certa em cada linha.
 */
export default function FrontDeskView() {
  const qc = useQueryClient();
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [tab, setTab] = useState<'arrivals' | 'inhouse' | 'departures'>('arrivals');
  const [assign, setAssign] = useState<Record<number, number>>({});

  const { data } = useQuery({
    queryKey: ['pms', 'frontdesk', day],
    queryFn: async () => (await apiClient.get('pms/frontdesk/', { params: { date: day } })).data,
    refetchInterval: 30000,
  });

  const inval = () => qc.invalidateQueries({ queryKey: ['pms'] });
  const checkIn = useMutation({
    mutationFn: ({ id, room }: any) => apiClient.post(`pms/reservations/${id}/check_in/`, room ? { room } : {}),
    onSuccess: () => { inval(); notifyGuide({ title: 'Check-in feito', message: 'O quarto passou a OCUPADO, foi aberto o folio e lançada a diária de alojamento.', hint: 'Os consumos do POS podem agora ser lançados na conta do quarto.' }); },
    onError: notifyError,
  });
  const checkOut = useMutation({
    mutationFn: (id: number) => apiClient.post(`pms/reservations/${id}/check_out/`, {}),
    onSuccess: () => { inval(); notifyGuide({ title: 'Check-out feito', message: 'A conta foi fechada e o quarto ficou VAGO/SUJO para a governanta limpar.' }); },
    onError: notifyError,
  });

  const k = data?.kpi;
  const rows: any[] = data?.[tab] || [];
  const free: any[] = data?.available_rooms || [];

  const Kpi = ({ label, value, tone = '#25405e', warn = false }: any) => (
    <div className="flex-1 bg-white border border-[#9aa6b6] px-3 py-2" style={{ boxShadow: 'inset 0 1px 0 #fff' }}>
      <div className="text-[10px] uppercase text-gray-500 font-bold tracking-wide">{label}</div>
      <div className="text-[22px] font-black leading-tight" style={{ color: warn ? '#a01818' : tone }}>{value}</div>
    </div>
  );

  const TabBtn = ({ id, icon: Icon, label, count }: any) => (
    <button onClick={() => setTab(id)}
      className={`px-4 py-2 text-[12px] font-bold border border-b-0 flex items-center gap-1.5 ${tab === id ? 'bg-white text-[#25405e] border-[#9aa6b6]' : 'bg-[#dfe3e8] text-gray-600 border-[#c0c7d0]'}`}>
      <Icon size={13} />{label}
      <span className={`px-1.5 rounded-sm text-[11px] ${tab === id ? 'bg-[#25405e] text-white' : 'bg-[#b9c1cb] text-white'}`}>{count ?? 0}</span>
    </button>
  );

  return (
    <ClassicWindow title="Balcão de Receção — Check-in / Check-out" icon={<DoorOpen size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Dia útil {data?.business_date} · o check-in abre a conta do quarto; o check-out exige conta saldada</div>}>
      <div className="h-full flex flex-col bg-[#dfe3e8] overflow-auto">
        {/* KPIs do dia */}
        <div className="p-3 flex gap-2">
          <Kpi label="Chegadas" value={k?.arrivals ?? '—'} />
          <Kpi label="Em casa" value={k?.inhouse ?? '—'} />
          <Kpi label="Saídas" value={k?.departures ?? '—'} />
          <Kpi label="Ocupação" value={k ? `${k.occupancy}%` : '—'} />
          <Kpi label="Quartos limpos" value={k?.rooms_clean ?? '—'} tone="#1f7a34" />
          <Kpi label="Por limpar" value={k?.rooms_dirty ?? '—'} tone="#b5651d" />
          <Kpi label="Em atraso" value={(k?.overdue_in ?? 0) + (k?.overdue_out ?? 0)} warn={!!((k?.overdue_in ?? 0) + (k?.overdue_out ?? 0))} />
          <Kpi label="Contas em aberto" value={k ? money(k.balance_due) : '—'} tone="#a01818" />
          <div className="flex flex-col justify-center bg-white border border-[#9aa6b6] px-3">
            <span className="text-[10px] uppercase text-gray-500 font-bold">Dia</span>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="border border-[#a0a0a0] px-1 text-[12px] bg-white" />
          </div>
        </div>

        {/* Separadores */}
        <div className="px-3 flex gap-1">
          <TabBtn id="arrivals" icon={LogIn} label="Chegadas" count={data?.arrivals?.length} />
          <TabBtn id="inhouse" icon={Users} label="Em casa" count={data?.inhouse?.length} />
          <TabBtn id="departures" icon={LogOut} label="Saídas" count={data?.departures?.length} />
        </div>

        <div className="mx-3 mb-3 bg-white border border-[#9aa6b6] flex-1 overflow-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0">
              <tr style={{ background: 'linear-gradient(to bottom, #f7f9fb, #e4e9ef)' }} className="text-[#25405e]">
                {['Reserva', 'Hóspede', 'Tipo', 'Quarto', 'Noites', 'Conta', 'Situação', 'Ação'].map((h) => (
                  <th key={h} className="text-left font-bold px-2 py-1.5 border-b border-[#c0c7d0]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-b border-[#e6e9ed] ${!r.ready ? 'bg-[#fff7e6]' : ''}`}>
                  <td className="px-2 py-1.5 font-mono text-[11px]">{r.confirmation}</td>
                  <td className="px-2 py-1.5 font-bold">{r.guest_name}<span className="font-normal text-gray-500"> · {r.adults + (r.children || 0)}p</span></td>
                  <td className="px-2 py-1.5">{r.room_type_name}</td>
                  <td className="px-2 py-1.5">
                    {r.room_number ? <span className="font-bold text-[#25405e] flex items-center gap-1"><BedDouble size={12} />{r.room_number}</span>
                      : tab === 'arrivals' ? (
                        <select value={assign[r.id] || ''} onChange={(e) => setAssign((a) => ({ ...a, [r.id]: Number(e.target.value) }))}
                          className="border border-[#a0a0a0] p-0.5 bg-white text-[11px]">
                          <option value="">— atribuir —</option>
                          {free.filter((f) => !r.room_type || f.room_type === r.room_type).map((f) => (
                            <option key={f.id} value={f.id}>{f.number} · {f.room_type_name}</option>
                          ))}
                        </select>
                      ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-2 py-1.5">{r.nights}</td>
                  <td className="px-2 py-1.5 font-mono">{r.folio_balance != null ? money(r.folio_balance) : '—'}</td>
                  <td className="px-2 py-1.5">
                    {r.ready ? <span className="text-green-700 font-bold">Pronto</span>
                      : (r.blockers || []).map((b: string, i: number) => (
                        <span key={i} className="flex items-center gap-1 text-[#a01818] font-bold text-[11px]"><AlertTriangle size={11} />{b}</span>
                      ))}
                  </td>
                  <td className="px-2 py-1.5">
                    {tab === 'departures' || r.status === 'CHECKED_IN' ? (
                      <button onClick={() => checkOut.mutate(r.id)}
                        className="px-2 py-1 text-[11px] font-bold text-white border border-[#7a1f1f]"
                        style={{ background: 'linear-gradient(to bottom, #b03a3a, #8a1a1a)' }}>Check-out</button>
                    ) : (
                      <button onClick={() => checkIn.mutate({ id: r.id, room: r.room || assign[r.id] })}
                        disabled={!r.room && !assign[r.id]}
                        className="px-2 py-1 text-[11px] font-bold text-white border border-[#16304a] disabled:opacity-40"
                        style={{ background: 'linear-gradient(to bottom, #2f5f92, #1e3f66)' }}>Check-in</button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="text-center text-gray-400 py-10">
                  {tab === 'arrivals' ? 'Sem chegadas para este dia.' : tab === 'inhouse' ? 'Sem hóspedes em casa.' : 'Sem saídas para este dia.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ClassicWindow>
  );
}
