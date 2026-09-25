import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { MiniLineChart, MiniBarChart } from './PmsReportCharts';

type Tab = 'performance' | 'revenue' | 'occupancy' | 'payments' | 'charges' | 'housekeeping';
const TABS: [Tab, string][] = [
  ['performance', 'Performance'], ['revenue', 'Receita'], ['occupancy', 'Ocupação'],
  ['payments', 'Pagamentos'], ['charges', 'Encargos'], ['housekeeping', 'Limpeza'],
];

const money = (v: number) => `Kz ${Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[#7FA9B1] px-3 py-2 flex-1 min-w-[110px]">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="font-bold text-[16px] text-[#062A31]">{value}</div>
    </div>
  );
}

/** Relatórios do PMS — Performance/Receita/Ocupação/Pagamentos/Encargos/
    Limpeza, sobre os endpoints de agregação reais em pms/reports/*. Nunca
    inventa dados: "revenue" é sempre a mesma conta que o check-in usa para
    lançar a 1ª diária (ver backend/pms/reports.py). */
export default function PmsReportsView() {
  const [tab, setTab] = useState<Tab>('performance');
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(today());
  const [hkTab, setHkTab] = useState<'check_ins' | 'check_outs' | 'stay_overs'>('check_ins');
  const [sourceMetric, setSourceMetric] = useState<'revenue' | 'reservations'>('revenue');

  const params = { date_from: dateFrom, date_to: dateTo };
  const { data: perf } = useQuery({ queryKey: ['pms', 'reports', 'performance', dateFrom, dateTo], queryFn: async () => (await apiClient.get('pms/reports/performance/', { params })).data, enabled: tab === 'performance' });
  const { data: rev } = useQuery({ queryKey: ['pms', 'reports', 'revenue', dateFrom, dateTo], queryFn: async () => (await apiClient.get('pms/reports/revenue/', { params })).data, enabled: tab === 'revenue' });
  const { data: occ } = useQuery({ queryKey: ['pms', 'reports', 'occupancy', dateFrom, dateTo], queryFn: async () => (await apiClient.get('pms/reports/occupancy/', { params })).data, enabled: tab === 'occupancy' });
  const { data: pay } = useQuery({ queryKey: ['pms', 'reports', 'payments', dateFrom, dateTo], queryFn: async () => (await apiClient.get('pms/reports/payments/', { params })).data, enabled: tab === 'payments' });
  const { data: chg } = useQuery({ queryKey: ['pms', 'reports', 'charges', dateFrom, dateTo], queryFn: async () => (await apiClient.get('pms/reports/charges/', { params })).data, enabled: tab === 'charges' });
  const { data: hk } = useQuery({ queryKey: ['pms', 'reports', 'housekeeping', dateFrom, dateTo], queryFn: async () => (await apiClient.get('pms/reports/housekeeping/', { params })).data, enabled: tab === 'housekeeping' });

  const inp = 'border border-[#7FA9B1] p-1 bg-white text-[11px]';

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex border-b border-[#7FA9B1] bg-[#F7FAFA]">
        {TABS.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-[12px] font-semibold border-r border-[#CFE3E6] ${tab === t ? 'bg-white text-[#062A31] border-b-2 border-b-[#0B4F5C]' : 'text-[#5C8891] hover:bg-white'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 p-2 bg-[#F7FAFA] border-b border-[#CFE3E6] text-[11px]">
        <span className="font-semibold text-[#062A31]">Período:</span>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inp} />
        <span>a</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inp} />
      </div>

      <div className="flex-1 overflow-auto p-3">
        {tab === 'performance' && perf && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <StatTile label="Reservas" value={String(perf.reservations)} />
              <StatTile label="Receita" value={money(perf.revenue)} />
              <StatTile label="ADR" value={money(perf.adr)} />
              <StatTile label="RevPAR" value={money(perf.revpar)} />
              <StatTile label="Ocupação" value={`${perf.occupancy_pct}%`} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-[#CFE3E6] p-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="font-bold text-[#062A31] text-[12px]">Origem das Reservas</div>
                  <div className="flex gap-1">
                    <button onClick={() => setSourceMetric('revenue')} className={`text-[10px] px-1.5 py-0.5 border ${sourceMetric === 'revenue' ? 'bg-[#0B4F5C] text-white border-[#0B4F5C]' : 'border-[#7FA9B1]'}`}>Receita</button>
                    <button onClick={() => setSourceMetric('reservations')} className={`text-[10px] px-1.5 py-0.5 border ${sourceMetric === 'reservations' ? 'bg-[#0B4F5C] text-white border-[#0B4F5C]' : 'border-[#7FA9B1]'}`}>Reservas</button>
                  </div>
                </div>
                <MiniBarChart data={perf.reservation_sources} labelKey="source" valueKey={sourceMetric}
                  formatValue={sourceMetric === 'revenue' ? money : (v) => String(v)} />
              </div>
              <div className="border border-[#CFE3E6] p-2">
                <div className="font-bold text-[#062A31] text-[12px] mb-1">RevPAR por Categoria</div>
                <MiniBarChart data={perf.revpar_by_category} labelKey="room_type" valueKey="revpar" formatValue={money} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-[#CFE3E6] p-2">
                <div className="font-bold text-[#062A31] text-[12px] mb-1">Receita Diária</div>
                <MiniLineChart data={perf.daily_revenue} labelKey="date" valueKey="revenue" formatValue={money} />
              </div>
              <div className="border border-[#CFE3E6] p-2">
                <div className="font-bold text-[#062A31] text-[12px] mb-1">Taxa de Ocupação Diária</div>
                <MiniLineChart data={perf.daily_occupancy_pct} labelKey="date" valueKey="occupancy_pct" formatValue={(v) => `${v}%`} />
              </div>
            </div>
          </div>
        )}

        {tab === 'revenue' && rev && (
          <table className="w-full text-[11px] border-collapse">
            <thead><tr className="border-b border-[#7FA9B1] text-left">
              <th className="py-1">Reserva</th><th>Data</th><th>Quarto</th>
              <th className="text-right">Encargos de Quarto</th><th className="text-right">Pagamentos</th><th className="text-right">Receita</th>
            </tr></thead>
            <tbody>
              {rev.rows.map((r: any, i: number) => (
                <tr key={i} className="border-b border-[#EEF4F5]">
                  <td className="py-1">{r.reservation}</td><td>{r.date}</td><td>{r.rooms}</td>
                  <td className="text-right">{money(r.room_charges)}</td><td className="text-right">{money(r.payments)}</td><td className="text-right font-semibold">{money(r.revenue)}</td>
                </tr>
              ))}
              {rev.rows.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-6">Sem reservas no período.</td></tr>}
            </tbody>
            <tfoot><tr className="border-t-2 border-[#062A31] font-bold">
              <td className="py-1" colSpan={3}>Total Geral</td>
              <td className="text-right">{money(rev.grand_total.room_charges)}</td><td className="text-right">{money(rev.grand_total.payments)}</td><td className="text-right">{money(rev.grand_total.revenue)}</td>
            </tr></tfoot>
          </table>
        )}

        {tab === 'occupancy' && occ && (
          <table className="w-full text-[11px] border-collapse">
            <thead><tr className="border-b border-[#7FA9B1] text-left">
              <th className="py-1">Data</th><th className="text-center">Quartos Ocupados</th><th className="text-center">Check-ins</th><th className="text-center">Check-outs</th><th className="text-right">Receita do Dia</th>
            </tr></thead>
            <tbody>
              {occ.rows.map((r: any, i: number) => (
                <tr key={i} className="border-b border-[#EEF4F5]">
                  <td className="py-1">{r.date}</td><td className="text-center">{r.rooms_occupied}</td><td className="text-center">{r.check_ins}</td><td className="text-center">{r.check_outs}</td><td className="text-right">{money(r.day_revenue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 border-[#062A31] font-bold"><td className="py-1" colSpan={4}>Total</td><td className="text-right">{money(occ.total_revenue)}</td></tr></tfoot>
          </table>
        )}

        {tab === 'payments' && pay && (
          <table className="w-full text-[11px] border-collapse">
            <thead><tr className="border-b border-[#7FA9B1] text-left"><th className="py-1">Data</th><th>Descrição</th><th>Reserva</th><th className="text-right">Valor</th></tr></thead>
            <tbody>
              {pay.rows.map((r: any, i: number) => (
                <tr key={i} className="border-b border-[#EEF4F5]"><td className="py-1">{r.date}</td><td>{r.description}</td><td>{r.reservation}</td><td className="text-right">{money(r.value)}</td></tr>
              ))}
              {pay.rows.length === 0 && <tr><td colSpan={4} className="text-center text-gray-400 py-6">Sem pagamentos no período.</td></tr>}
            </tbody>
            <tfoot><tr className="border-t-2 border-[#062A31] font-bold"><td className="py-1" colSpan={3}>Total</td><td className="text-right">{money(pay.total)}</td></tr></tfoot>
          </table>
        )}

        {tab === 'charges' && chg && (
          <table className="w-full text-[11px] border-collapse">
            <thead><tr className="border-b border-[#7FA9B1] text-left"><th className="py-1">Item</th><th className="text-center">Quantidade</th><th className="text-right">Receita</th></tr></thead>
            <tbody>
              {chg.rows.map((r: any, i: number) => (
                <tr key={i} className="border-b border-[#EEF4F5]"><td className="py-1">{r.item}</td><td className="text-center">{r.quantity}</td><td className="text-right">{money(r.revenue)}</td></tr>
              ))}
              {chg.rows.length === 0 && <tr><td colSpan={3} className="text-center text-gray-400 py-6">Sem encargos extra no período.</td></tr>}
            </tbody>
            <tfoot><tr className="border-t-2 border-[#062A31] font-bold"><td className="py-1" colSpan={2}>Total</td><td className="text-right">{money(chg.total)}</td></tr></tfoot>
          </table>
        )}

        {tab === 'housekeeping' && hk && (
          <div>
            <div className="flex gap-1 mb-2">
              {([['check_ins', 'Check-in'], ['check_outs', 'Check-out'], ['stay_overs', 'Estadia']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setHkTab(k)} className={`px-2 py-1 text-[11px] border ${hkTab === k ? 'bg-[#0B4F5C] text-white border-[#0B4F5C]' : 'border-[#7FA9B1]'}`}>{label}</button>
              ))}
            </div>
            {hk.rows.map((r: any, i: number) => (
              <div key={i} className="border-b border-[#EEF4F5] py-1.5 text-[11px]">
                <div className="font-semibold text-[#062A31]">{r.date} · {r[`${hkTab}_count`]} {hkTab === 'check_ins' ? 'check-in(s)' : hkTab === 'check_outs' ? 'check-out(s)' : 'estadia(s)'}</div>
                {r[hkTab].map((it: any, j: number) => (
                  <div key={j} className="text-gray-600 pl-2">Quarto {it.room} · {it.guest} · {it.reservation}</div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
