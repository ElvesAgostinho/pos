import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';
const cell = 'w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px] bg-white';

/**
 * UNIDADE DE STOCK — Caixa de 12, Barril de 30L, Cápsula.
 *
 * "Arredondar" é com quantas casas decimais se conta esta unidade: a cerveja ao
 * barril mede-se em litros com decimais; as cápsulas contam-se às unidades — meia
 * cápsula não existe. Sem isto, o inventário fica com 3,4 cápsulas.
 *
 * Os FATORES DE CONVERSÃO (1 Caixa = 12 Unidades) são o que permite comprar à caixa
 * e vender à unidade sem o stock endoidecer.
 */
export default function UomEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [d, setD] = useState<any>({ rounding: 0, is_active: true, conversions: [], ...row });
  const [sel, setSel] = useState<number | null>(null);

  const { data: uoms = [] } = useQuery({
    queryKey: ['posc', 'uoms2'],
    queryFn: async () => (await apiClient.get('pos/config/uoms/')).data,
  });

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/uoms/', d)
      : apiClient.patch(`pos/config/uoms/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({
        title: 'Unidade gravada',
        message: 'As conversões passam a valer nas compras e nas vendas — entra 1 caixa, saem 12 unidades.',
      });
      onClose();
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const cs: any[] = d.conversions || [];
  const setC = (i: number, k: string, v: any) => set('conversions', cs.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const addC = () => set('conversions', [...cs, { to_uom: null, factor: 1 }]);
  const delC = () => {
    if (sel === null) return;
    set('conversions', cs.filter((_, j) => j !== sel));
    setSel(null);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Nova unidade' : `A editar ${d.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-2 max-w-[820px]">
          <label className="flex items-center gap-3 text-[12px]">
            <span className="w-[110px] text-[#333]">Código:<span className="text-[#a01818]">*</span></span>
            <input value={d.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())}
              className={`${inp} w-[290px]`} style={inputStyle} />
          </label>
          <label className="flex items-center gap-3 text-[12px]">
            <span className="w-[110px] text-[#333]">Descrição:<span className="text-[#a01818]">*</span></span>
            <input value={d.name || ''} onChange={(e) => set('name', e.target.value)}
              className={`${inp} flex-1`} style={inputStyle} />
          </label>
          <label className="flex items-center gap-3 text-[12px]">
            <span className="w-[110px] text-[#333]">Arredondar:</span>
            <input type="number" min={0} max={4} value={d.rounding ?? 0}
              onChange={(e) => set('rounding', Number(e.target.value))}
              className={`${inp} w-[130px]`} style={inputStyle} />
            <span className="text-[11px] text-[#666]">
              casas decimais — 0 para o que se conta à unidade (cápsulas, garrafas)
            </span>
          </label>
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
            Ativo
          </label>
        </div>

        <div className="max-w-[820px] mt-4 border border-[#c8c8c8]">
          <table className="w-full text-[12px] border-collapse">
            <thead><tr className="bg-[#f0f0f0]">
              <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Código</th>
              <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Descrição</th>
              <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0] w-[160px]">Fator de conversão</th>
            </tr></thead>
            <tbody>
              {cs.map((c, i) => (
                <tr key={i} onClick={() => setSel(i)}
                  className={`border-b border-[#eee] cursor-pointer ${sel === i ? 'bg-[#cfe2f3]' : ''}`}>
                  <td className="p-0.5" colSpan={2}>
                    <select value={c.to_uom || ''} onChange={(e) => setC(i, 'to_uom', Number(e.target.value) || null)}
                      className={cell}>
                      <option value="">— escolha a unidade —</option>
                      {(uoms as any[]).filter((u) => u.id !== row?.id).map((u) => (
                        <option key={u.id} value={u.id}>{u.code} · {u.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-0.5">
                    <input type="number" step="any" value={c.factor ?? 1}
                      onChange={(e) => setC(i, 'factor', e.target.value)} className={`${cell} text-right`} />
                  </td>
                </tr>
              ))}
              {cs.length === 0 && (
                <tr><td colSpan={3} className="text-center text-[#999] py-8">
                  Sem conversões. Ex.: 1 {d.code || 'CX'} = 12 UN.
                </td></tr>
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-end gap-4 px-3 py-2 bg-[#f4f4f4] border-t border-[#d5d5d5]">
            <button onClick={addC} className="flex items-center gap-2 text-[12px] hover:bg-[#e8e8e8] px-1 py-1">
              <span className="w-5 h-5 rounded-full bg-[#2b2b2b] text-white flex items-center justify-center text-[11px]">＋</span> Adicionar
            </button>
            <button onClick={delC} disabled={sel === null}
              className="flex items-center gap-2 text-[12px] hover:bg-[#e8e8e8] px-1 py-1 disabled:opacity-35">
              <span className="w-5 h-5 rounded-full bg-[#c0392b] text-white flex items-center justify-center text-[11px]">−</span> Remover
            </button>
          </div>
        </div>
      </div>

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
