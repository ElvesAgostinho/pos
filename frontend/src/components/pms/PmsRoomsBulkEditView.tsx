import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';
import { Toolbar } from '../posconfig/kit';
import { barraDeTitulo } from '../../config/theme';

/**
 * EDIÇÃO EM MASSA DE QUARTOS — uma linha por quarto, um só "Gravar" no fim.
 *
 * Mostrava DUAS colunas (número e categoria) em quinhentos pixéis de um ecrã
 * de mil e quinhentos, e o resto era branco. O problema não era o espaço: era
 * que o quarto tem mais campos do que isso e o ecrã não deixava tocar-lhes.
 * Quem dá entrada de quarenta quartos quer dizer, na mesma passagem, quais
 * estão por limpar e quais estão fora de serviço — senão tem de abrir os
 * quarenta, um a um, noutro ecrã.
 *
 * O ESTADO "OCUPADO" NÃO SE ESCOLHE AQUI, e é deliberado: um quarto fica
 * ocupado por haver um check-in, não por alguém o marcar numa grelha. Deixar
 * mudá-lo à mão era permitir dizer que o 203 está livre com o hóspede lá
 * dentro. Quando o quarto já está ocupado, a célula di-lo e não deixa mexer —
 * isso resolve-se no check-out.
 *
 * EDIFÍCIO E PISO continuam de fora porque não há endpoint que os liste
 * (pms/urls.py não regista nenhum). Pôr uma coluna que grava um piso que não
 * se consegue escolher era pior do que não ter a coluna.
 *
 * Sobre pms/rooms/, que já existia: POST para os novos, PATCH para os que
 * mudaram. Nenhum endpoint novo.
 */

/** Os estados que a GOVERNANTA controla. "Ocupado" não entra — ver acima. */
const ESTADOS = [
  { v: 'VACANT_CLEAN', t: 'Livre / Limpo' },
  { v: 'VACANT_DIRTY', t: 'Livre / Por limpar' },
  { v: 'OOO', t: 'Fora de serviço' },
];
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
  const addRow = () => setRows((rs) => [...rs, { id: null, number: '', room_type: rtList[0]?.id || '',
    status: 'VACANT_CLEAN', is_active: true, _dirty: true }]);

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
        const payload: any = {
          number: r.number, room_type: r.room_type,
          is_active: r.is_active !== false,
        };
        // O ESTADO SÓ VAI SE FOR UM DOS QUE SE PODEM ESCOLHER. Num quarto
        // ocupado a célula está bloqueada, e mandar o valor à mesma seria
        // reescrevê-lo com ele próprio a cada gravação.
        if (ESTADOS.some((e) => e.v === r.status)) payload.status = r.status;
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
        <table className="border-collapse text-[12px] w-full max-w-[980px]">
          <thead>
            <tr>
              <th className="text-left border-b pb-1 pr-2 w-[170px]" style={{ borderColor: '#C8C8C8' }}>Número do quarto*</th>
              <th className="text-left border-b pb-1 pr-2 w-[290px]" style={{ borderColor: '#C8C8C8' }}>Categoria*</th>
              <th className="text-left border-b pb-1 pr-2 w-[210px]" style={{ borderColor: '#C8C8C8' }}>Estado</th>
              <th className="text-left border-b pb-1 w-[100px]" style={{ borderColor: '#C8C8C8' }}>Activo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const ocupado = r.status === 'OCCUPIED';
              return (
                <tr key={r.id ?? `new-${i}`}>
                  <td className="pr-2 py-1">
                    <input value={r.number} onChange={(e) => setField(i, 'number', e.target.value)}
                      className="border p-1 w-full" style={{ borderColor: '#C8C8C8' }} />
                  </td>
                  <td className="pr-2 py-1">
                    <select value={r.room_type} onChange={(e) => setField(i, 'room_type', Number(e.target.value))}
                      className="border p-1 bg-white w-full" style={{ borderColor: '#C8C8C8' }}>
                      <option value="">Escolha…</option>
                      {rtList.map((rt: any) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
                    </select>
                  </td>
                  <td className="pr-2 py-1">
                    {ocupado ? (
                      <span className="flex items-center gap-1.5 px-1 py-[3px] text-[11.5px]"
                        title="Um quarto fica livre por check-out, não por se marcar aqui."
                        style={{ color: '#9A4236' }}>
                        <span className="w-[8px] h-[8px] flex-shrink-0" style={{ background: '#9A4236' }} />
                        Ocupado
                      </span>
                    ) : (
                      <select value={r.status || 'VACANT_CLEAN'}
                        onChange={(e) => setField(i, 'status', e.target.value)}
                        className="border p-1 bg-white w-full" style={{ borderColor: '#C8C8C8' }}>
                        {ESTADOS.map((e) => <option key={e.v} value={e.v}>{e.t}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="py-1">
                    {/* DESACTIVAR NÃO É APAGAR: o quarto sai da operação e do
                        cálculo da ocupação, mas o histórico de quem lá dormiu
                        fica. É o que se usa quando um quarto passa a arrumos. */}
                    <label className="flex items-center gap-1.5 cursor-pointer"
                      title="Um quarto desactivado sai da operação; o histórico fica.">
                      <input type="checkbox" checked={r.is_active !== false}
                        onChange={(e) => setField(i, 'is_active', e.target.checked)} />
                      <span style={{ color: r.is_active === false ? '#9A4236' : '#6B7280' }}>
                        {r.is_active === false ? 'Não' : 'Sim'}
                      </span>
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length > 0 && (
          <div className="mt-2 text-[11px]" style={{ color: '#6B7280' }}>
            {rows.length} quarto(s) · {rows.filter((r) => r._dirty).length} por gravar
          </div>
        )}
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
                <div className="text-[12px] text-[#6B7280] mt-1.5 max-w-md mx-auto leading-relaxed">
                  Um quarto pertence sempre a uma categoria — é ela que tem o preço e a
                  capacidade. Crie primeiro as suas categorias (Standard, Suite…) e depois
                  volte aqui para dar entrada dos quartos.
                </div>
                {onNavigate && (
                  <button onClick={() => onNavigate('room_types')}
                    className="mt-4 px-5 py-2 text-[12px] font-semibold text-white rounded-[8px] hover:brightness-110"
                    style={barraDeTitulo()}>
                    Criar categorias de quarto
                  </button>
                )}
              </>
            ) : (
              <div className="text-[12px] text-[#6B7280]">
                Sem quartos — clique em <b>Adicionar Linha</b> para dar entrada do primeiro.
              </div>
            )}
          </div>
        )}
      </div>
      <Toolbar actions={[
        { label: 'Adicionar Linha', icon: '＋', onClick: addRow,
          disabled: rtList.length === 0,
          title: rtList.length === 0
            ? 'Crie primeiro uma categoria de quarto — um quarto tem de pertencer a uma.'
            : 'Acrescenta uma linha para um quarto novo' },
        { label: saving ? 'A gravar…' : 'Gravar Tudo', icon: '💾', onClick: save, disabled: saving },
      ]} />
    </div>
  );
}
