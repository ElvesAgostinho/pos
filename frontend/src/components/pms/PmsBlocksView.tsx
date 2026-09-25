import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Toolbar } from '../posconfig/kit';
import ClassicGrid from '../ui/ClassicGrid';
import { apiClient } from '../../api/client';
import PmsBlockEditorDialog from './PmsBlockEditorDialog';

/** Blocos — a lista; a ficha (criar/editar) é a mesma usada em "Reservas de
 * Grupo" (PmsBlockEditorDialog), para não haver dois formulários do mesmo bloco. */
export default function PmsBlocksView() {
  const { data, refetch } = useQuery({ queryKey: ['pms', 'blocks'], queryFn: async () => (await apiClient.get('pms/blocks/')).data });
  const rows = Array.isArray(data) ? data : data?.results || [];
  const [selId, setSelId] = useState<number | null>(null);
  const sel = rows.find((r: any) => r.id === selId);
  const [editing, setEditing] = useState<'new' | 'edit' | 'copy' | null>(null);

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-hidden">
        <ClassicGrid rowKey="id" data={rows} selectedRowId={selId ?? undefined}
          onRowClick={(r: any) => setSelId(r.id)} onRowDoubleClick={() => setEditing('edit')}
          columns={[
            { header: 'Código', accessor: 'code', width: '15%' },
            { header: 'Descrição', accessor: 'description', width: '30%' },
            { header: 'Válido de', accessor: 'valid_from', width: '13%' },
            { header: 'Até', accessor: 'valid_to', width: '13%' },
            { header: 'Empresa', accessor: (r: any) => r.main_entity_name || r.group_name || '—', width: '19%' },
            { header: 'Garantido', accessor: (r: any) => r.is_guaranteed ? 'Sim' : 'Não', width: '10%' },
          ]} />
      </div>
      <Toolbar actions={[
        { label: 'Novo', icon: '＋', onClick: () => setEditing('new') },
        { label: 'Copiar', icon: '⧉', disabled: !sel, onClick: () => setEditing('copy') },
        { label: 'Editar', icon: '✎', disabled: !sel, onClick: () => setEditing('edit') },
      ]} />

      {editing === 'new' && (
        <PmsBlockEditorDialog onClose={() => setEditing(null)}
          onSaved={(id) => { setEditing(null); setSelId(id); refetch(); }} />
      )}
      {editing === 'edit' && sel && (
        <PmsBlockEditorDialog block={sel} onClose={() => setEditing(null)}
          onSaved={(id) => { setEditing(null); setSelId(id); refetch(); }} />
      )}
      {editing === 'copy' && sel && (
        <PmsBlockEditorDialog copyFrom={sel} onClose={() => setEditing(null)}
          onSaved={(id) => { setEditing(null); setSelId(id); refetch(); }} />
      )}
    </div>
  );
}
