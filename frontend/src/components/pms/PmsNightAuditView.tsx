import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';
import { Toolbar, Glyph, money } from '../posconfig/kit';
import ClassicGrid from '../ui/ClassicGrid';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Auditoria da Noite — lança a diária das noites intermédias de estadias em
    curso (POST pms/night-audit/run/), que o check-in não lança (só a 1ª
    noite). Uma execução por data/hotel (o servidor recusa repetir). */
export default function PmsNightAuditView() {
  const qc = useQueryClient();
  const [auditDate, setAuditDate] = useState(todayIso());
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const { data, refetch } = useQuery({
    queryKey: ['pms', 'night-audit-runs'],
    queryFn: async () => (await apiClient.get('pms/night-audit-runs/')).data,
  });
  const rows: any[] = Array.isArray(data) ? data : data?.results || [];

  const run = async () => {
    setRunning(true);
    setLastResult(null);
    try {
      const r = await apiClient.post('pms/night-audit/run/', { audit_date: auditDate });
      setLastResult(r.data);
      aviso(`Auditoria concluída: ${r.data.rooms_charged} quarto(s) lançado(s), total ${money(r.data.total_posted)} Kz.`);
      refetch(); qc.invalidateQueries({ queryKey: ['pms'] });
    } catch (e) { notifyError(e); } finally { setRunning(false); }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-auto p-4" style={{ background: '#F7FAFA' }}>
        <div className="border border-[#CFE3E6] p-4 max-w-[480px] mb-6 bg-white">
          <div className="font-bold text-[13px] text-[#062A31] mb-3 flex items-center gap-1.5">
            <Glyph icon="🌙" size={16} /> Auditoria da Noite
          </div>
          <p className="text-[11px] text-[#5C8891] mb-3">
            Lança a diária (Alojamento) das reservas em check-in cuja noite desta data ainda não
            foi faturada — a 1ª noite já é lançada no check-in; as seguintes entram aqui, uma vez
            por dia. Não pode ser corrida duas vezes para a mesma data.
          </p>
          <label className="flex items-center gap-2 text-[12px] mb-3">
            <span className="w-[90px]">Data</span>
            <input type="date" value={auditDate} onChange={(e) => setAuditDate(e.target.value)}
              className="border border-[#7FA9B1] p-1.5 text-[12px]" />
          </label>
          <button onClick={run} disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#062A31] text-white text-[12px] font-semibold disabled:opacity-50">
            <Glyph icon="🌙" size={14} /> {running ? 'A executar…' : 'Executar Auditoria'}
          </button>
          {lastResult && (
            <div className="mt-3 text-[12px] border-t border-[#EEF4F5] pt-2">
              <div>Quartos lançados: <b>{lastResult.rooms_charged}</b></div>
              <div>Total lançado: <b>{money(lastResult.total_posted)} Kz</b></div>
            </div>
          )}
        </div>

        <div className="font-bold text-[12px] text-[#062A31] mb-2">Histórico de Execuções</div>
        <div style={{ height: 300 }}>
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Data Auditada', accessor: 'audit_date', width: '18%' },
            { header: 'Executada em', accessor: (r: any) => new Date(r.run_at).toLocaleString('pt-PT'), width: '25%' },
            { header: 'Por', accessor: (r: any) => r.run_by || '—', width: '17%' },
            { header: 'Quartos', accessor: 'rooms_charged', width: '15%' },
            { header: 'Total Lançado', accessor: (r: any) => `${money(r.total_posted)} Kz`, width: '25%' },
          ]} />
        </div>
      </div>
      <Toolbar actions={[{ label: 'Atualizar Histórico', icon: '⟳', color: '#062A31', onClick: () => refetch() }]} />
    </div>
  );
}
