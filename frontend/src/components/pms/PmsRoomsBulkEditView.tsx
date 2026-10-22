import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';
import { Toolbar } from '../posconfig/kit';

/** Edição em massa de Quartos — uma linha por quarto (número + categoria),
    tudo editável de seguida, um só "Gravar" no fim. Sobre pms/rooms/, já
    existente (POST para novos, PATCH para os que mudaram) — sem endpoint
    novo nenhum. */
export default function PmsRoomsBulkEditView({ onNavigate }: { onNavigate?: (s: string) => void }) {
  const qc = useQueryClient();
  const { data: roomTypes } = useQuery({ queryKey: ['pms', 'room-types'], queryFn: async () => (await apiClient.get('pms/room-types/')).data });
  const rtList: any[] = Array.isArray(roomTypes) ? roomTypes : roomTypes?.results || [];

  const { data, refetch } = useQuery({ queryKey: ['pms', 'rooms'], queryFn: async () => (await apiClient.get('pms/rooms/')).data });
  const serverRows: any[] = Array.isArray(data) ? data : data?.results || [];

  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { setRows(serverRows.map((r) => ({ ...r, _dirty: false }))); }, [JSON.stringify(serverRows.map((r) => r.id))]);

  const setField = (idx: number, field: string, value: any) => {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, [field]: value, _dirty: true } : r)));
  };
  const addRow = () => setRows((rs) => [...rs, { id: null, number: '', room_type: rtList[0]?.id || '', _dirty: true }]);

  const [saving, setSaving] = useState(false);
  const save = async () => {
    const dirty = rows.filter((r) => r._dirty);
    if (dirty.length === 0) { aviso('Nada por gravar.'); return; }
    const semNumero = dirty.find((r) => !String(r.number || '').trim());
    if (semNumero) { aviso('Todos os quartos têm de ter um número.'); return; }
    const semCategoria = dirty.find((r) => !r.room_type);
    if (semCategoria) { aviso('Todos os quartos têm de ter uma categoria.'); return; }
    setSaving(true);
    try {
      for (const r of dirty) {
        const payload = { number: r.number, room_type: r.room_type };
        if (r.id) await apiClient.patch(`pms/rooms/${r.id}/`, payload);
        else await apiClient.post('pms/rooms/', payload);
      }
      aviso(`${dirty.length} quarto(s) gravado(s).`);
      refetch(); qc.invalidateQueries({ queryKey: ['pms'] });
    } catch (e) { notifyError(e); } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-auto p-3">
        <table className="border-collapse text-[13px] w-full max-w-[560px]">
          <thead>
            <tr>
              <th className="text-left border-b border-[#E6E8EC] pb-1 pr-2">Número do quarto*</th>
              <th className="text-left border-b border-[#E6E8EC] pb-1">Categoria*</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? `new-${i}`}>
                <td className="pr-2 py-1"><input value={r.number} onChange={(e) => setField(i, 'number', e.target.value)} className="border border-[#E6E8EC] p-1 w-full" /></td>
                <td className="py-1">
                  <select value={r.room_type} onChange={(e) => setField(i, 'room_type', Number(e.target.value))} className="border border-[#E6E8EC] p-1 bg-white w-full">
                    <option value="">Escolha…</option>
                    {rtList.map((rt: any) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* O ecrã dizia "clique em Adicionar Linha" com esse botão DESLIGADO:
            mandava fazer o que ele próprio impedia, e nunca explicava que falta
            uma categoria. Um quarto tem de pertencer a uma categoria (é ela que
            tem o preço e a capacidade) — por isso, sem categorias, o que falta
            não é um quarto: é o passo anterior. */}
        {rows.length === 0 && (
          <div className="text-center py-10 px-6">
            {rtList.length === 0 ? (
              <>
                <div className="text-[14px] font-semibold text-[#111827]">
                  Ainda não há categorias de quarto
                </div>
                <div className="text-[13px] text-[#6B7280] mt-1.5 max-w-md mx-auto leading-relaxed">
                  Um quarto pertence sempre a uma categoria — é ela que tem o preço e a
                  capacidade. Crie primeiro as suas categorias (Standard, Suite…) e depois
                  volte aqui para dar entrada dos quartos.
                </div>
                {onNavigate && (
                  <button onClick={() => onNavigate('room_types')}
                    className="mt-4 px-5 py-2 text-[13px] font-semibold text-white rounded-[999px] hover:brightness-110"
                    style={{ background: '#2563EB' }}>
                    Criar categorias de quarto
                  </button>
                )}
              </>
            ) : (
              <div className="text-[13px] text-[#6B7280]">
                Sem quartos — clique em <b>Adicionar Linha</b> para dar entrada do primeiro.
              </div>
            )}
          </div>
        )}
      </div>
      <Toolbar actions={[
        { label: 'Adicionar Linha', icon: '＋', color: '#1E2A44', onClick: addRow,
          disabled: rtList.length === 0,
          title: rtList.length === 0
            ? 'Crie primeiro uma categoria de quarto — um quarto tem de pertencer a uma.'
            : 'Acrescenta uma linha para um quarto novo' },
        { label: saving ? 'A gravar…' : 'Gravar Tudo', icon: '💾', color: '#1E2A44', onClick: save, disabled: saving },
      ]} />
    </div>
  );
}
