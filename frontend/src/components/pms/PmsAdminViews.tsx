import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { apiClient } from '../../api/client';
import { BedDouble, Moon, Building2, Plus, Play, TrendingUp, ArrowDownCircle, ArrowUpCircle, Sparkles, Wrench } from 'lucide-react';

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const btn = 'px-3 py-1.5 text-[12px] border border-[#c0c0c0] bg-gradient-to-b from-white to-[#e4e4e4] hover:to-[#d4d4d4] active:translate-y-px flex items-center gap-1.5';

// ======================= DASHBOARD PMS =======================
function Kpi({ icon: Icon, label, value, color, sub }: any) {
  return (
    <div className="bg-white border border-[#c0c0c0] shadow-[inset_1px_1px_0_#fff] p-3 flex items-center gap-3 min-w-[180px]">
      <div className="w-11 h-11 rounded flex items-center justify-center flex-shrink-0" style={{ background: color }}><Icon size={22} className="text-white" /></div>
      <div><div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div><div className="text-2xl font-bold text-[#1e3f66]">{value}</div>{sub && <div className="text-[10px] text-gray-500">{sub}</div>}</div>
    </div>
  );
}
export function PmsDashboardView() {
  const { data: d } = useQuery({ queryKey: ['pms-dash'], queryFn: async () => (await apiClient.get('pms/dashboard/')).data, refetchInterval: 20000 });
  return (
    <ClassicWindow title="Dashboard PMS" icon={<BedDouble size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Ocupação, chegadas/saídas, receita e operações · {d?.date}</div>}>
      <div className="p-4 space-y-4 bg-[#ececec] h-full overflow-auto">
        <div>
          <div className="text-[11px] font-bold text-[#1e3f66] mb-2 uppercase">Ocupação</div>
          <div className="flex flex-wrap gap-2">
            <Kpi icon={BedDouble} label="Ocupação" value={`${d?.occupancy_pct ?? 0}%`} color="#c9a400" sub={`${d?.occupied ?? 0} / ${d?.rooms_total ?? 0} quartos`} />
            <Kpi icon={ArrowDownCircle} label="Chegadas hoje" value={d?.arrivals_today ?? 0} color="#2e7d32" />
            <Kpi icon={ArrowUpCircle} label="Saídas hoje" value={d?.departures_today ?? 0} color="#c0392b" />
            <Kpi icon={BedDouble} label="In-house" value={d?.in_house ?? 0} color="#1565c0" sub={`${d?.open_folios ?? 0} folios abertos`} />
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-[#1e3f66] mb-2 uppercase">Receita (folios abertos)</div>
          <div className="flex flex-wrap gap-2">
            <Kpi icon={TrendingUp} label="Alojamento" value={money(d?.room_revenue)} color="#16a085" />
            <Kpi icon={TrendingUp} label="Extras (F&B/Spa/…)" value={money(d?.ancillary_revenue)} color="#b5651d" />
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-[#1e3f66] mb-2 uppercase">Operações</div>
          <div className="flex flex-wrap gap-2">
            <Kpi icon={Sparkles} label="Limpeza pendente" value={d?.housekeeping_pending ?? 0} color="#c9820a" sub={`${d?.dirty_rooms ?? 0} quartos por limpar`} />
            <Kpi icon={Wrench} label="Manutenção aberta" value={d?.maintenance_open ?? 0} color="#a01818" sub={`${d?.ooo_rooms ?? 0} fora de serviço`} />
          </div>
        </div>
      </div>
    </ClassicWindow>
  );
}

// ======================= NIGHT AUDIT =======================
export function NightAuditView() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['night-audit'], queryFn: async () => (await apiClient.get('pms/night-audit/')).data, refetchInterval: 30000 });
  const run = useMutation({
    mutationFn: async () => (await apiClient.post('pms/night-audit/', {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['night-audit'] }),
    onError: (e: any) => alert(e?.response?.data?.detail || 'Erro'),
  });
  const history = data?.history || [];
  return (
    <ClassicWindow title="Night Audit — Fecho do Dia" icon={<Moon size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Lança o alojamento da noite nas contas em check-in · executar uma vez por dia</div>}>
      <div className="p-4 space-y-4 bg-[#ececec] h-full overflow-auto">
        <div className="bg-white border border-[#c0c0c0] p-4 flex items-center gap-4">
          <Moon size={40} className="text-[#1e3f66]" />
          <div className="flex-1">
            <div className="text-lg font-bold text-[#1e3f66]">Fecho do dia</div>
            <div className="text-sm text-gray-600">{data?.in_house ?? 0} conta(s) em check-in · lança o alojamento da noite no folio de cada hóspede</div>
          </div>
          <button className={`${btn} text-sm h-10 px-4`} disabled={run.isPending} onClick={() => { if (confirm('Executar o Night Audit de hoje?')) run.mutate(); }}><Play size={15} />Executar Night Audit</button>
        </div>
        {run.data && <div className="bg-green-50 border border-green-300 text-green-800 px-3 py-2 text-[12px]">Night Audit executado: {run.data.rooms_charged} quartos · receita alojamento {money(run.data.room_revenue)}</div>}
        <div>
          <div className="text-[11px] font-bold text-[#1e3f66] mb-2 uppercase">Histórico</div>
          <div className="bg-white border border-[#c0c0c0] text-[12px]">
            <div className="grid grid-cols-[110px_100px_130px_90px_90px_1fr] font-bold bg-[#f0f0f0] border-b border-[#ddd] px-2 py-1"><span>Data</span><span>Quartos</span><span className="text-right">Receita aloj.</span><span>Chegadas</span><span>Saídas</span><span>Executado</span></div>
            {history.map((h: any) => (
              <div key={h.id} className="grid grid-cols-[110px_100px_130px_90px_90px_1fr] px-2 py-1 border-b border-[#eee]">
                <span className="font-bold">{h.business_date}</span><span>{h.rooms_charged}</span><span className="text-right">{money(h.room_revenue)}</span>
                <span>{h.arrivals}</span><span>{h.departures}</span><span className="text-gray-500">{new Date(h.run_at).toLocaleString('pt-PT')} · {h.run_by || '—'}</span>
              </div>
            ))}
            {history.length === 0 && <div className="px-3 py-2 text-gray-500">Sem fechos registados.</div>}
          </div>
        </div>
      </div>
    </ClassicWindow>
  );
}

// ======================= AGÊNCIAS / EMPRESAS =======================
export function AgenciesView() {
  const qc = useQueryClient();
  const { data: accounts = [] } = useQuery({ queryKey: ['corp'], queryFn: async () => (await apiClient.get('pms/corporate-accounts/')).data });
  const [f, setF] = useState<any>({ kind: 'COMPANY', name: '', tax_id: '', contact_person: '', phone: '', credit_limit: 0, commission_percent: 0, payment_terms_days: 30 });
  const create = useMutation({
    mutationFn: async () => (await apiClient.post('pms/corporate-accounts/', { ...f, credit_limit: Number(f.credit_limit), commission_percent: Number(f.commission_percent) })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['corp'] }); setF({ ...f, name: '', tax_id: '', contact_person: '' }); },
  });
  return (
    <ClassicWindow title="Agências & Empresas — Contas de Crédito" icon={<Building2 size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Contas a crédito para empresas e agências (limite, comissão, prazo de pagamento)</div>}>
      <div className="p-4 space-y-3 bg-[#ececec] h-full overflow-auto">
        <div className="bg-white border border-[#c0c0c0] p-3 flex flex-wrap items-end gap-2 text-[12px]">
          <label className="flex flex-col">Tipo<select className="border border-[#c0c0c0] px-2 py-1" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option value="COMPANY">Empresa</option><option value="AGENCY">Agência</option></select></label>
          <label className="flex flex-col">Nome<input className="border border-[#c0c0c0] px-2 py-1 w-52" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
          <label className="flex flex-col">NIF<input className="border border-[#c0c0c0] px-2 py-1 w-36" value={f.tax_id} onChange={e => setF({ ...f, tax_id: e.target.value })} /></label>
          <label className="flex flex-col">Contacto<input className="border border-[#c0c0c0] px-2 py-1 w-36" value={f.contact_person} onChange={e => setF({ ...f, contact_person: e.target.value })} /></label>
          <label className="flex flex-col">Limite crédito<input type="number" className="border border-[#c0c0c0] px-2 py-1 w-28" value={f.credit_limit} onChange={e => setF({ ...f, credit_limit: e.target.value })} /></label>
          <label className="flex flex-col">Comissão %<input type="number" className="border border-[#c0c0c0] px-2 py-1 w-20" value={f.commission_percent} onChange={e => setF({ ...f, commission_percent: e.target.value })} /></label>
          <button className={btn} disabled={!f.name} onClick={() => create.mutate()}><Plus size={13} />Criar conta</button>
        </div>
        <div className="bg-white border border-[#c0c0c0] text-[12px]">
          <div className="grid grid-cols-[80px_1fr_120px_120px_120px_80px] font-bold bg-[#f0f0f0] border-b border-[#ddd] px-2 py-1"><span>Tipo</span><span>Nome</span><span className="text-right">Limite</span><span className="text-right">Em dívida</span><span className="text-right">Disponível</span><span>Comissão</span></div>
          {accounts.map((a: any) => (
            <div key={a.id} className="grid grid-cols-[80px_1fr_120px_120px_120px_80px] px-2 py-1 border-b border-[#eee]">
              <span>{a.kind_display}</span><span className="font-bold">{a.name}{a.tax_id ? <span className="text-gray-500 font-normal"> · {a.tax_id}</span> : ''}</span>
              <span className="text-right">{money(a.credit_limit)}</span>
              <span className="text-right text-[#a01818]">{money(a.balance)}</span>
              <span className="text-right text-[#1f9d55]">{money(a.available_credit)}</span>
              <span>{Number(a.commission_percent)}%</span>
            </div>
          ))}
          {accounts.length === 0 && <div className="px-3 py-2 text-gray-500">Sem contas de crédito.</div>}
        </div>
      </div>
    </ClassicWindow>
  );
}
