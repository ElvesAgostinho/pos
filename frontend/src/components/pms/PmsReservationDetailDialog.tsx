import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, LogIn, LogOut, RefreshCw, Save, Pencil, Users, History, DollarSign, FileText, Utensils, User } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';
import PmsFolioPanel from './PmsFolioPanel';
import PmsNewReservationDialog from './PmsNewReservationDialog';
import PmsCheckInDialog from './PmsCheckInDialog';
import PmsHistoryDialog from './PmsHistoryDialog';
import PmsPriceViewDialog from './PmsPriceViewDialog';
import PmsSharerManagerDialog from './PmsSharerManagerDialog';
import PmsProformaDialog from './PmsProformaDialog';
import PmsMealPlanDialog from './PmsMealPlanDialog';
import { openGuestInfoWindow } from './guestInfoWindow';

const STATUS_LABEL: Record<string, string> = {
  OPTION: 'Opção', BOOKED: 'Reservada', CHECKED_IN: 'Check-in', CHECKED_OUT: 'Check-out',
  CANCELLED: 'Cancelada', NO_SHOW: 'No-show', WAITLIST: 'Lista de Espera',
};
const STATUS_COLOR: Record<string, string> = {
  OPTION: '#4dd0e1', BOOKED: '#3ea34e', CHECKED_IN: '#2b6cb0', CHECKED_OUT: '#6b6b6b',
  CANCELLED: '#c0392b', NO_SHOW: '#c0392b', WAITLIST: '#c98a1e',
};
const naoConstruido = (label: string) => aviso(`"${label}" ainda não está construído nesta fase do PMS.`);
const fmtD = (iso: string) => iso ? new Date(iso).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDT = (iso: string) => iso ? new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const TABS = ['Detalhe selecionado', 'Grupo', 'Funções', 'Documentos', 'Outras reservas do hóspede', 'Campos personalizados', 'Outros'] as const;

function TabBtn({ active, onClick, children }: any) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 text-[12px] font-semibold border-b-2 ${active ? 'border-[#2b2b2b] text-[#111]' : 'border-transparent text-[#777] hover:text-[#111]'}`}>
      {children}
    </button>
  );
}
function Placeholder({ label }: { label: string }) {
  return <div className="p-6 text-center text-gray-400 text-[12px]">"{label}" ainda não está construído nesta fase do PMS.</div>;
}
/** Ação da barra inferior — ícone + texto, plana, sem moldura. Uma linha só
 * (a barra desliza na horizontal em vez de quebrar para uma 2ª linha). */
function Act({ icon: Icon, label, onClick, disabled }: any) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex items-center gap-1.5 px-2 py-1.5 text-[12px] text-[#333] whitespace-nowrap flex-shrink-0 hover:bg-[#ddd] disabled:opacity-35 disabled:cursor-default disabled:hover:bg-transparent">
      <Icon size={13} /> {label}
    </button>
  );
}
function Divider() {
  return <span className="w-px h-5 bg-[#c5c5c5] mx-1 flex-shrink-0" />;
}

export default function PmsReservationDetailDialog({ reservation, hotelName, onClose, onChanged }: {
  reservation: any; hotelName: string; onClose: () => void; onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<typeof TABS[number]>('Detalhe selecionado');
  const [showFolio, setShowFolio] = useState(false);
  const [showEditar, setShowEditar] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);
  const [showPreco, setShowPreco] = useState(false);
  const [showSharer, setShowSharer] = useState(false);
  const [showProforma, setShowProforma] = useState(false);
  const [showMealPlan, setShowMealPlan] = useState(false);
  const [notes, setNotes] = useState(reservation.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const r = reservation;

  const { data: roomTypes } = useQuery({ queryKey: ['pms', 'room-types'], queryFn: async () => (await apiClient.get('pms/room-types/')).data });
  const rtList = Array.isArray(roomTypes) ? roomTypes : roomTypes?.results || [];

  const { data: fresh, refetch } = useQuery({
    queryKey: ['pms', 'reservations', r.id],
    queryFn: async () => (await apiClient.get(`pms/reservations/${r.id}/`)).data,
    initialData: r,
  });
  const res = fresh || r;

  const { data: guest } = useQuery({
    queryKey: ['pos', 'entities', res.guest],
    queryFn: async () => (await apiClient.get(`pos/marketing/entities/${res.guest}/`)).data,
    enabled: !!res.guest,
  });

  const { data: block } = useQuery({
    queryKey: ['pms', 'blocks', res.block],
    queryFn: async () => (await apiClient.get(`pms/blocks/${res.block}/`)).data,
    enabled: !!res.block && tab === 'Grupo',
  });
  const { data: siblings } = useQuery({
    queryKey: ['pms', 'reservations', 'block', res.block],
    queryFn: async () => (await apiClient.get('pms/reservations/', { params: { block: res.block } })).data,
    enabled: !!res.block && tab === 'Grupo',
  });
  const siblingRows = (Array.isArray(siblings) ? siblings : siblings?.results || []);

  const { data: outras } = useQuery({
    queryKey: ['pms', 'reservations', 'guest', res.guest],
    queryFn: async () => (await apiClient.get('pms/reservations/', { params: { guest: res.guest } })).data,
    enabled: !!res.guest && tab === 'Outras reservas do hóspede',
  });
  const outrasRows = (Array.isArray(outras) ? outras : outras?.results || []).filter((x: any) => x.id !== res.id);

  const doCheckOut = async () => { try { await apiClient.post(`pms/reservations/${res.id}/check_out/`, {}); refetch(); onChanged(); } catch (e) { notifyError(e); } };

  const gravarNotas = async () => {
    setSavingNotes(true);
    try { await apiClient.patch(`pms/reservations/${res.id}/`, { notes }); refetch(); onChanged(); }
    catch (e) { notifyError(e); } finally { setSavingNotes(false); }
  };

  const gravarCredito = async (campo: string, valor: any) => {
    try {
      await apiClient.patch(`pos/marketing/entities/${res.guest}/`, { [campo]: valor });
      qc.invalidateQueries({ queryKey: ['pos', 'entities', res.guest] });
    } catch (e) { notifyError(e); }
  };

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40">
      <div className="w-[1150px] max-w-[97vw] bg-[#f0f0f0] border border-[#8a8a8a] shadow-2xl flex flex-col" style={{ height: 'min(88vh, 800px)' }}>
        <div className="h-9 flex items-center justify-between px-3 text-white text-[14px] font-bold flex-shrink-0" style={{ background: '#3c3c3c' }}>
          Reserva {res.confirmation} - {hotelName}
          <div className="flex items-center gap-2">
            <button className="text-white/70 hover:text-white" title="Janelas"><Copy size={13} /></button>
            <button onClick={onClose} title="Fechar"
              className="w-5 h-5 rounded-full flex items-center justify-center bg-[#e74c3c] text-white hover:brightness-110">
              <X size={12} strokeWidth={3} />
            </button>
          </div>
        </div>

        {/* mini-grelha desta reserva */}
        <div className="bg-white border-b border-[#d0d0d0] overflow-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead style={{ background: '#eef1f4' }}>
              <tr>
                {['ID', 'Hóspede', 'Quarto', 'Categoria', 'Pax', 'Estado', 'Check-In', 'Check-Out', 'Conta'].map((h) => (
                  <th key={h} className="text-left px-2 py-1.5 border-b border-[#c0c7d0] font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-2 py-1.5">{res.id}</td>
                <td className="px-2 py-1.5">{res.guest_name}</td>
                <td className="px-2 py-1.5">{res.room_number || '—'}</td>
                <td className="px-2 py-1.5">{res.room_type_name}</td>
                <td className="px-2 py-1.5">{res.adults + res.children}</td>
                <td className="px-2 py-1.5">
                  <span className="text-[10px] text-white font-semibold px-2 py-0.5 rounded" style={{ background: STATUS_COLOR[res.status] }}>
                    {STATUS_LABEL[res.status] || res.status}
                  </span>
                </td>
                <td className="px-2 py-1.5">{res.check_in}</td>
                <td className="px-2 py-1.5">{res.check_out}</td>
                <td className="px-2 py-1.5">{res.folio_id || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex bg-[#e8e8e8] border-b border-[#c0c0c0] flex-shrink-0 overflow-x-auto">
          {TABS.map((t) => <TabBtn key={t} active={tab === t} onClick={() => setTab(t)}>{t}</TabBtn>)}
        </div>

        <div className="flex-1 overflow-auto bg-white">
          {tab === 'Detalhe selecionado' && (
            <div className="flex gap-4 p-4">
              <div className="w-[280px] flex-shrink-0 border border-[#c0c7d0]">
                <div className="p-3 border-b border-[#e0e0e0]">
                  <div className="font-bold text-[15px] flex items-center gap-1.5">{res.guest_name}</div>
                  <div className="flex justify-between text-[11px] mt-1">
                    <span className="text-green-700">{fmtD(res.check_in)}</span>
                    <span className="text-red-600">{fmtD(res.check_out)}</span>
                  </div>
                  <div className="text-center text-[11px] text-gray-500">{res.nights} noite(s)</div>
                </div>
                <div className="text-center text-white font-bold py-1.5" style={{ background: STATUS_COLOR[res.status] }}>
                  {STATUS_LABEL[res.status] || res.status}
                </div>
                <div className="p-3 border-b border-[#e0e0e0] flex items-center justify-between">
                  <span className="font-semibold">{res.room_type_name}</span>
                  <span className="text-gray-500 text-[11px]">#{res.id}</span>
                </div>
                {Number(res.rate) > 0 && (
                  <div className="p-3 border-b border-[#e0e0e0] font-bold text-[16px]">
                    {Number(res.rate).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} Kz
                    <span className="text-[11px] font-normal text-gray-500 float-right">Pax: {res.adults}/{res.children}</span>
                  </div>
                )}
                <div className="p-3 border-b border-[#e0e0e0] text-[11px]">
                  <div className="text-gray-500">Data Criação</div>
                  <div>{fmtDT(res.created_at)}</div>
                </div>
                <div className="p-3 text-[11px]">
                  <div className="text-gray-500">Package</div>
                  <div>{res.rate_plan_code || '(nenhum)'}</div>
                </div>
              </div>
              <div className="flex-1">
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-semibold">Notas:</span>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6}
                    className="border border-[#a0a0a0] p-2 text-[12px]" />
                  <button onClick={gravarNotas} disabled={savingNotes}
                    className="self-start flex items-center gap-1.5 px-3 py-1 bg-[#2b7a3b] text-white text-[12px] font-semibold disabled:opacity-50">
                    <Save size={13} /> {savingNotes ? 'A gravar…' : 'Gravar notas'}
                  </button>
                </label>
              </div>
            </div>
          )}

          {tab === 'Grupo' && (
            res.block ? (
              <div className="p-4">
                <div className="font-bold mb-2">{block?.code} · {block?.description}</div>
                {block && <div className="text-[11px] text-gray-500 mb-3">{block.valid_from} → {block.valid_to}</div>}
                <table className="w-full text-[11px] border-collapse">
                  <thead style={{ background: '#eef1f4' }}><tr>
                    {['Confirmação', 'Hóspede', 'Categoria', 'Quarto', 'Check-In', 'Check-Out', 'Estado'].map((h) => (
                      <th key={h} className="text-left px-2 py-1.5 border-b border-[#c0c7d0]">{h}</th>))}
                  </tr></thead>
                  <tbody>
                    {siblingRows.map((s: any) => (
                      <tr key={s.id} className={s.id === res.id ? 'bg-[#e4f0ff]' : ''}>
                        <td className="px-2 py-1">{s.confirmation}</td><td className="px-2 py-1">{s.guest_name}</td>
                        <td className="px-2 py-1">{s.room_type_name}</td><td className="px-2 py-1">{s.room_number || '—'}</td>
                        <td className="px-2 py-1">{s.check_in}</td><td className="px-2 py-1">{s.check_out}</td>
                        <td className="px-2 py-1">{STATUS_LABEL[s.status] || s.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="p-6 text-center text-gray-400 text-[12px]">Esta reserva não está associada a nenhum grupo/bloco.</div>
          )}

          {tab === 'Funções' && (
            <div className="p-4 flex gap-4 flex-wrap">
              {[
                { title: 'Geral', items: [['Verificar Contas', 'folio'], ['Editar Reserva', 'editar'], ['Atualizar', 'atualizar']] },
                { title: 'Financeiro', items: [['Encargos Fixos', false], ['Depósitos', false], ['Vouchers', false], ['Comissões', false]] },
                { title: 'Relacionamento com o hóspede', items: [['Mensagem', false], ['Carta de Confirmação', false], ['Cartão de Hóspede', false]] },
                { title: 'Outros', items: [['Recriar conta', false], ['Tipos de limpeza', false]] },
              ].map((g) => (
                <div key={g.title} className="w-[220px]">
                  <div className="px-2 py-1 font-bold text-[11px] bg-[#eef1f4] border border-[#c0c7d0] border-b-0">{g.title}</div>
                  <div className="border border-[#c0c7d0]">
                    {g.items.map(([label, action]: any) => (
                      <button key={label}
                        onClick={() => {
                          if (action === 'folio') setShowFolio(true);
                          else if (action === 'editar') setShowEditar(true);
                          else if (action === 'atualizar') refetch();
                          else naoConstruido(label);
                        }}
                        className={`w-full text-left px-3 py-2 text-[12px] border-b last:border-b-0 border-[#e8e8e8] hover:bg-[#f5f5f5] ${action ? '' : 'text-gray-400'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'Documentos' && <Placeholder label="Documentos" />}
          {tab === 'Campos personalizados' && <Placeholder label="Campos personalizados" />}

          {tab === 'Outras reservas do hóspede' && (
            outrasRows.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-[12px]">{res.guest_name} não tem outras reservas.</div>
            ) : (
              <table className="w-full text-[11px] border-collapse">
                <thead style={{ background: '#eef1f4' }}><tr>
                  {['Hotel', 'Confirmação', 'Check-In', 'Check-Out', 'Pax', 'Quarto', 'Estado'].map((h) => (
                    <th key={h} className="text-left px-2 py-1.5 border-b border-[#c0c7d0]">{h}</th>))}
                </tr></thead>
                <tbody>
                  {outrasRows.map((o: any) => (
                    <tr key={o.id}>
                      <td className="px-2 py-1">{hotelName}</td><td className="px-2 py-1">{o.confirmation}</td>
                      <td className="px-2 py-1">{o.check_in}</td><td className="px-2 py-1">{o.check_out}</td>
                      <td className="px-2 py-1">{o.adults + o.children}</td><td className="px-2 py-1">{o.room_number || '—'}</td>
                      <td className="px-2 py-1">{STATUS_LABEL[o.status] || o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {tab === 'Outros' && (
            <div className="p-4 flex gap-4 flex-wrap items-start">
              <div className="w-[420px] border border-[#c0c7d0]">
                <div className="px-2 py-1 font-bold text-[11px] bg-[#eef1f4] border-b border-[#c0c7d0]">Limite de crédito — {res.guest_name}</div>
                {!guest ? <div className="p-3 text-gray-400 text-[11px]">A carregar…</div> : (
                  <div className="p-3 flex items-center gap-2 text-[12px]">
                    <input type="number" defaultValue={guest.credit_limit} onBlur={(e) => gravarCredito('credit_limit', e.target.value)}
                      className="border border-[#a0a0a0] p-1 w-[110px]" />
                    <select defaultValue={guest.credit_limit_mode} onChange={(e) => gravarCredito('credit_limit_mode', e.target.value)}
                      className="border border-[#a0a0a0] p-1 flex-1">
                      <option>Sem restrições</option>
                      <option>Com restrições</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="w-[320px] border border-[#c0c7d0]">
                <div className="px-2 py-1 font-bold text-[11px] bg-[#eef1f4] border-b border-[#c0c7d0]">Código QR</div>
                <div className="p-4 flex flex-col items-center gap-2">
                  <QRCodeSVG value={`RES:${res.confirmation}`} size={160} />
                  <div className="text-[10px] text-gray-500">RES:{res.confirmation}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 px-2 py-1.5 bg-[#e8e8e8] border-t border-[#c0c0c0] flex-shrink-0 overflow-x-auto">
          <Act icon={Pencil} label="Editar" onClick={() => setShowEditar(true)} />
          <Act icon={RefreshCw} label="Atualizar" onClick={() => refetch()} />
          <Divider />
          <Act icon={History} label="Histórico" onClick={() => setShowHistorico(true)} />
          <Act icon={DollarSign} label="Visualizar Preço" onClick={() => setShowPreco(true)} />
          <Act icon={Users} label="Sharer Manager" onClick={() => setShowSharer(true)} />
          <Divider />
          <Act icon={LogIn} label="Check-In" disabled={res.status !== 'OPTION' && res.status !== 'BOOKED'} onClick={() => setShowCheckIn(true)} />
          <Act icon={LogOut} label="Check-Out" disabled={res.status !== 'CHECKED_IN'} onClick={doCheckOut} />
          <Divider />
          <Act icon={FileText} label="Pro-forma" onClick={() => setShowProforma(true)} />
          <Act icon={Utensils} label="Mapa de Refeições" onClick={() => setShowMealPlan(true)} />
          <Act icon={User} label="Guest Info" onClick={() => openGuestInfoWindow(res)} />
          <div className="flex-1 min-w-2" />
          <button onClick={onClose} className="flex items-center gap-1.5 px-2 py-1 font-semibold text-[#333] hover:text-black flex-shrink-0 whitespace-nowrap">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#e74c3c] text-white"><X size={9} strokeWidth={3} /></span>
            Fechar
          </button>
        </div>
      </div>

      {showFolio && <PmsFolioPanel reservationId={res.id} onClose={() => setShowFolio(false)} />}
      {showEditar && (
        <PmsNewReservationDialog roomTypes={rtList} reservation={res} onClose={() => setShowEditar(false)}
          onCreated={() => { setShowEditar(false); refetch(); onChanged(); }} />
      )}
      {showCheckIn && (
        <PmsCheckInDialog reservation={res} onClose={() => setShowCheckIn(false)}
          onDone={() => { setShowCheckIn(false); refetch(); onChanged(); }} />
      )}
      {showHistorico && <PmsHistoryDialog reservation={res} onClose={() => setShowHistorico(false)} />}
      {showPreco && <PmsPriceViewDialog reservation={res} onClose={() => setShowPreco(false)} />}
      {showSharer && <PmsSharerManagerDialog reservation={res} onClose={() => setShowSharer(false)} />}
      {showProforma && <PmsProformaDialog reservation={res} onClose={() => setShowProforma(false)} />}
      {showMealPlan && <PmsMealPlanDialog reservation={res} onClose={() => setShowMealPlan(false)} />}
    </div>
  );
}
