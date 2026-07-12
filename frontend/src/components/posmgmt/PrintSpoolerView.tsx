import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicGrid from '../ui/ClassicGrid';
import { Printer, Check, RotateCcw } from 'lucide-react';
import { usePrintJobs, useMarkPrinted, useRetryPrint } from '../../hooks/usePosMgmt';

const STATUS = [
  { value: '', label: 'Todos' }, { value: 'QUEUED', label: 'Em fila' },
  { value: 'PRINTED', label: 'Impresso' }, { value: 'FAILED', label: 'Falhou' },
];
const STATUS_CLS: Record<string, string> = { QUEUED: 'text-[#b06a00] font-bold', PRINTED: 'text-green-700', FAILED: 'text-red-600' };

export default function PrintSpoolerView() {
  const [status, setStatus] = useState('QUEUED');
  const { data: jobs = [] } = usePrintJobs(status || undefined);
  const mark = useMarkPrinted();
  const retry = useRetryPrint();

  return (
    <ClassicWindow title="Spooler de Impressão (POS)" icon={<Printer size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{jobs.length} trabalhos · um agente local consome a fila e imprime · atualiza automaticamente</div>}>
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          <label className="font-bold text-gray-700">Estado:</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-[#a0a0a0] p-1 bg-white">
            {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={jobs}
            columns={[
              { header: 'Hora', accessor: (r: any) => new Date(r.created_at).toLocaleTimeString('pt-PT'), width: '12%' },
              { header: 'Tipo', accessor: 'job_type_display', width: '16%' },
              { header: 'Título', accessor: 'title', width: '24%' },
              { header: 'Destino', accessor: (r: any) => r.target || '—', width: '12%' },
              { header: 'Ref.', accessor: (r: any) => r.reference || '—', width: '12%' },
              { header: 'Estado', accessor: (r: any) => <span className={STATUS_CLS[r.status] || ''}>{r.status_display}</span>, width: '12%' },
              { header: 'Ações', accessor: (r: any) => (
                <div className="flex gap-2">
                  {r.status !== 'PRINTED' && <button title="Marcar impresso" onClick={() => mark.mutate(r.id)} className="text-green-700 hover:text-green-900"><Check size={13} /></button>}
                  <button title="Reimprimir" onClick={() => retry.mutate(r.id)} className="text-[#1e3f66] hover:text-[#16304a]"><RotateCcw size={12} /></button>
                </div>), width: '12%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
