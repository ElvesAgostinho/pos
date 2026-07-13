import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, money } from './kit';
import { ItemPicker } from './Pickers';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';
const cell = 'w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px] bg-white';

function Row({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex items-center gap-3 text-[12px]">
      <span className="w-[100px] flex-shrink-0 text-[#333]">{label}</span>
      {children}
    </label>
  );
}

/**
 * PACKAGE — o preço fechado ("Menu de Casamento a 25.000/pessoa").
 *
 * Junta artigos com quantidades num só preço: o cliente compra UMA coisa, o hotel
 * lança as dez que a compõem — e o stock sai de todas. Sem isto, o comercial
 * escreve o pacote à mão em cada proposta e esquece-se sempre de um item.
 *
 * O TOTAL é somado aqui à frente: é o número que o comercial compara com o preço
 * que vai pedir. Se o pacote custa mais a fazer do que o que se cobra, vê-se já.
 */
export default function PackageEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [d, setD] = useState<any>({ is_active: true, lines: [], ...row });
  const [picker, setPicker] = useState(false);
  const [sel, setSel] = useState<number | null>(null);

  const { data: sectors = [] } = useQuery({
    queryKey: ['posc', 'sectors'],
    queryFn: async () => (await apiClient.get('pos/config/sectors/')).data,
  });

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/packages/', d)
      : apiClient.patch(`pos/config/packages/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({
        title: 'Package gravado',
        message: 'Ao vender o pacote, o sistema lança sozinho todos os artigos que o compõem — e o stock sai de todos.',
      });
      onClose();
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const lines: any[] = d.lines || [];
  const setLine = (i: number, k: string, v: any) => set('lines', lines.map((l, j) => j === i ? { ...l, [k]: v } : l));
  const addLines = (rows: any[]) => {
    set('lines', [...lines, ...rows.map((r) => ({
      item: r.id, item_code: r.code, item_name: r.name,
      quantity: 1, unit_price: r.sale_price || 0,
    }))]);
    setPicker(false);
  };
  const total = lines.reduce((a, l) => a + Number(l.quantity || 0) * Number(l.unit_price || 0), 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Novo package' : `A editar ${d.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Ficha */}
        <div className="w-[46%] p-4 space-y-2 overflow-auto border-r border-[#e0e0e0]">
          <Row label="Código:">
            <input value={d.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())}
              className={`${inp} w-[290px]`} style={inputStyle} />
          </Row>
          <Row label="Descrição:">
            <input value={d.name || ''} onChange={(e) => set('name', e.target.value)}
              className={`${inp} flex-1`} style={inputStyle} />
          </Row>
          <Row label="Setor:">
            <select value={d.sector || ''} onChange={(e) => set('sector', Number(e.target.value) || null)}
              className={`${inp} flex-1`} style={inputStyle}>
              <option value="">—</option>
              {(sectors as any[]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Row>
          <label className="flex items-center gap-2 text-[12px] pt-1">
            <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
            Ativo
          </label>

          <fieldset className="border border-[#c8c8c8] px-3 pb-3 pt-1 mt-3">
            <legend className="text-[12px] px-1">Línguas</legend>
            {[1, 2, 3].map((n) => (
              <Row key={n} label={`Língua ${n}:`}>
                <input value={d[`name_lang_${n}`] || ''} onChange={(e) => set(`name_lang_${n}`, e.target.value)}
                  className={`${inp} flex-1`} style={inputStyle} />
              </Row>
            ))}
          </fieldset>
        </div>

        {/* Artigos */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 bg-[#e9e9e9] text-[12px] font-bold text-[#333] border-b border-[#d0d0d0]">
            Artigos
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead className="sticky top-0"><tr className="bg-[#f4f4f4]">
                {['Artigo', 'Quantidade', 'Valor', 'Total'].map((h) => (
                  <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} onClick={() => setSel(i)}
                    className={`border-b border-[#eee] cursor-pointer ${sel === i ? 'bg-[#cfe2f3]' : ''}`}>
                    <td className="px-2 py-1"><b className="font-mono">{l.item_code}</b> · {l.item_name}</td>
                    <td className="p-0.5 w-[110px]">
                      <input type="number" step="any" value={l.quantity}
                        onChange={(e) => setLine(i, 'quantity', e.target.value)} className={`${cell} text-right`} />
                    </td>
                    <td className="p-0.5 w-[120px]">
                      <input type="number" step="any" value={l.unit_price}
                        onChange={(e) => setLine(i, 'unit_price', e.target.value)} className={`${cell} text-right`} />
                    </td>
                    <td className="px-2 py-1 text-right font-bold">
                      {money(Number(l.quantity || 0) * Number(l.unit_price || 0))}
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-[#999] py-10">
                    Sem artigos. O pacote tem de conter o que o cliente recebe.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-4 px-3 py-2 bg-[#f4f4f4] border-t border-[#d0d0d0]">
            <button onClick={() => setPicker(true)} className="flex items-center gap-2 text-[12px] hover:bg-[#e8e8e8] px-1 py-1">
              <span className="w-5 h-5 rounded-full bg-[#2b2b2b] text-white flex items-center justify-center text-[11px]">＋</span> Adicionar
            </button>
            <button onClick={() => { if (sel !== null) { set('lines', lines.filter((_, j) => j !== sel)); setSel(null); } }}
              disabled={sel === null}
              className="flex items-center gap-2 text-[12px] hover:bg-[#e8e8e8] px-1 py-1 disabled:opacity-35">
              <span className="w-5 h-5 rounded-full bg-[#c0392b] text-white flex items-center justify-center text-[11px]">−</span> Apagar
            </button>
            <span className="ml-auto text-[16px] font-black text-[#1f7a34]">Total: {money(total)}</span>
          </div>
        </div>
      </div>

      {picker && (
        <ItemPicker exclude={lines.map((l) => l.item)} title="Adicionar - Artigos do package"
          onPick={addLines} onClose={() => setPicker(false)} />
      )}

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
