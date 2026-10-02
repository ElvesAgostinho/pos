import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicGrid from '../ui/ClassicGrid';
import { ShieldCheck } from 'lucide-react';
import { useAudit } from '../../hooks/usePosMgmt';
import { AUDIT_EVENTS } from '../../api/posmgmt';

const EVENT_COLOR: Record<string, string> = {
  PAYMENT: 'text-[#1A1D21]', DOC_ISSUE: 'text-[#6B7280]', TICKET_VOID: 'text-[#912018]',
  CASH_CLOSE: 'text-[#1A1D21]', CASH_OPEN: 'text-[#1A1D21]', CASH_MOVE: 'text-[#1A1D21]',
};

export default function AuditView() {
  const [event, setEvent] = useState('');
  const { data: logs = [] } = useAudit(event || undefined);

  return (
    <ClassicWindow title="Auditoria de Operação (POS)" icon={<ShieldCheck size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{logs.length} registos · atualiza automaticamente</div>}>
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 bg-[#F3F4F6] border-b border-[#D7DBDF] px-3 py-2 text-[11px]">
          <label className="font-bold text-gray-700">Evento:</label>
          <select value={event} onChange={(e) => setEvent(e.target.value)} className="border border-[#D7DBDF] p-1 bg-white">
            {AUDIT_EVENTS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id"
            data={logs}
            columns={[
              { header: 'Data/Hora', accessor: (r: any) => new Date(r.created_at).toLocaleString('pt-PT'), width: '15%' },
              { header: 'Evento', accessor: (r: any) => <span className={`font-bold ${EVENT_COLOR[r.event_type] || 'text-gray-700'}`}>{r.event_type_display}</span>, width: '15%' },
              { header: 'Descrição', accessor: 'description', width: '27%' },
              { header: 'Ref.', accessor: (r: any) => r.reference || '—', width: '12%' },
              { header: 'Operador', accessor: (r: any) => r.operator_name || '—', width: '11%' },
              { header: 'Utilizador', accessor: (r: any) => r.user || '—', width: '10%' },
              { header: 'IP', accessor: (r: any) => r.ip_address || '—', width: '10%' },
            ]}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
