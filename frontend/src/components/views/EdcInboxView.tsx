import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicGrid from '../ui/ClassicGrid';
import { Inbox, CheckCircle, FileText } from 'lucide-react';
import { apiClient } from '../../api/client';

interface Props { onClose?: () => void }

/**
 * Inbox Documental — "o que precisa da minha atenção agora":
 * (1) tarefas/aprovações pendentes (Workflow) e (2) documentos recentes de todas as áreas.
 * O arquivo completo e pesquisável está no Reporting Center.
 */
export default function EdcInboxView(_props: Props) {
  const qc = useQueryClient();
  const { data: tasks = [] } = useQuery({
    queryKey: ['inbox', 'tasks'],
    queryFn: async () => (await apiClient.get('platform/workflow-tasks/', { params: { status: 'PENDING' } })).data,
  });
  const { data: docs } = useQuery({
    queryKey: ['inbox', 'docs'],
    queryFn: async () => (await apiClient.get('documents/center/', { params: { limit: 15 } })).data,
  });
  const complete = useMutation({
    mutationFn: (id: number) => apiClient.patch(`platform/workflow-tasks/${id}/`, { status: 'DONE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  });

  const recent = docs?.results ?? [];
  const AREA: Record<string, string> = { FATURACAO: 'Faturação', POS: 'POS', PMS: 'PMS', COMPRAS: 'Compras', STOCK: 'Stock', TESOURARIA: 'Tesouraria', CONTABILIDADE: 'Contabilidade' };

  return (
    <ClassicWindow title="Inbox Documental — Pendentes & Recentes" icon={<Inbox size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{tasks.length} pendente(s) · {recent.length} documento(s) recente(s) · arquivo completo no Reporting Center</div>}>
      <div className="flex flex-col h-full">
        <div className="bg-[#eef4fb] border-b border-[#a0a0a0] px-3 py-1.5 text-[11px] text-gray-700">
          Aqui aparece o que precisa da sua atenção: <b>tarefas/aprovações pendentes</b> e os <b>documentos mais recentes</b> de todas as áreas.
        </div>
        {/* Tarefas pendentes */}
        <div className="border-b border-[#a0a0a0]">
          <div className="bg-[#f0f0f0] px-3 py-1.5 text-[11px] font-bold flex items-center gap-1"><CheckCircle size={12} /> Tarefas / Aprovações pendentes</div>
          <div className="max-h-52 overflow-auto">
            <ClassicGrid rowKey="id" data={tasks} columns={[
              { header: 'Tarefa', accessor: 'title', width: '34%' },
              { header: 'Fluxo', accessor: (r: any) => r.flow_name || '—', width: '20%' },
              { header: 'Responsável', accessor: (r: any) => r.assignee || '—', width: '18%' },
              { header: 'Prioridade', accessor: (r: any) => <span className={r.priority === 'URGENT' ? 'text-red-600 font-bold' : r.priority === 'HIGH' ? 'text-amber-700' : ''}>{r.priority_display}</span>, width: '14%' },
              { header: '', accessor: (r: any) => <button onClick={() => complete.mutate(r.id)} title="Concluir" className="text-green-700 hover:text-green-900 flex items-center gap-1 text-[11px]"><CheckCircle size={12} /> Concluir</button>, width: '14%' },
            ]} />
            {tasks.length === 0 && <div className="text-center text-gray-400 text-[11px] py-3">Sem tarefas pendentes ✓</div>}
          </div>
        </div>
        {/* Documentos recentes */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="bg-[#f0f0f0] px-3 py-1.5 text-[11px] font-bold flex items-center gap-1"><FileText size={12} /> Documentos recentes</div>
          <div className="flex-1 overflow-auto">
            <ClassicGrid rowKey="ref" data={recent.map((r: any, i: number) => ({ ...r, _k: i }))} columns={[
              { header: 'Área', accessor: (r: any) => AREA[r.category] || r.category, width: '15%' },
              { header: 'Tipo', accessor: 'doc_type', width: '22%' },
              { header: 'Número', accessor: 'number', width: '18%' },
              { header: 'Data', accessor: (r: any) => r.date || '—', width: '13%' },
              { header: 'Entidade', accessor: (r: any) => r.party || '—', width: '20%' },
              { header: 'Estado', accessor: 'status', width: '12%' },
            ]} />
          </div>
        </div>
      </div>
    </ClassicWindow>
  );
}
