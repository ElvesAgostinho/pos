import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputCls, inputStyle } from './kit';

/**
 * MENSAGEM DO POS — a pergunta que o terminal faz ao operador.
 *
 * Ex.: pede-se um GELADO → o POS pergunta o sabor, e os MODELOS são as respostas
 * possíveis (SABOR CHOCOLATE, SABOR BAUNILHA…). Cada resposta sai IMPRESSA na
 * comanda da impressora certa. É assim que a cozinha sabe o que fazer sem ter de
 * telefonar à sala.
 */
export default function MessageEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [d, setD] = useState<any>({ sort_order: 0, is_message: true, is_comment: true, is_active: true, options: [], ...row });

  const { data: printers = [] } = useQuery({
    queryKey: ['posc', 'printers'],
    queryFn: async () => (await apiClient.get('inventory/pos/printers/')).data,
  });

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('production/pos-messages/', d)
      : apiClient.patch(`production/pos-messages/${row.id}/`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['posc'] }); notifyGuide({ title: 'Mensagem gravada', message: 'O POS passa a fazer esta pergunta ao operador, e as respostas saem na comanda.' }); onClose(); },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const opts: any[] = d.options || [];
  const setOpt = (i: number, k: string, v: any) =>
    set('options', opts.map((o, j) => j === i ? { ...o, [k]: v } : o));
  const addOpt = () => set('options', [...opts, { key_label: '', print_label: '', sort_order: 0, printer: null, on_emenu: false }]);
  const delOpt = (i: number) => set('options', opts.filter((_, j) => j !== i));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Nova mensagem' : `A editar ${d.code}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Cabeçalho: código, ordem, tipo */}
        <div className="flex items-center gap-6 mb-4 text-[13px]">
          <label className="flex items-center gap-3">
            <span className="w-[70px] text-[#333]">Código:<span className="text-[#a01818]">*</span></span>
            <input value={d.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())}
              placeholder="GELADO, TEMP, PONTO…" className={`${inputCls} w-[290px] flex-none`} style={inputStyle} />
          </label>
          <label className="flex items-center gap-3">
            <span className="text-[#333]">Ordem:</span>
            <input type="number" value={d.sort_order ?? 0} onChange={(e) => set('sort_order', Number(e.target.value))}
              className={`${inputCls} w-[110px] flex-none`} style={inputStyle} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!d.is_message} onChange={(e) => set('is_message', e.target.checked)} className="w-4 h-4" />
            Mensagem
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!d.is_comment} onChange={(e) => set('is_comment', e.target.checked)} className="w-4 h-4" />
            Comentário
          </label>
        </div>

        {/* Modelos (respostas) */}
        <div className="border border-[#c0c0c0]">
          <div className="px-3 py-1.5 bg-[#e9e9e9] text-[13px] font-bold text-[#333] border-b border-[#c0c0c0]">Modelos</div>
          <div className="flex">
            <table className="flex-1 text-[12px] border-collapse">
              <thead>
                <tr className="bg-[#f4f4f4] text-[#333]">
                  {['Tecla', 'Impressão', 'Ordem', 'Impressora', 'E-menu'].map((h) => (
                    <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">{h}</th>
                  ))}
                  <th className="w-[60px] border-b border-[#d0d0d0]" />
                </tr>
              </thead>
              <tbody>
                {opts.map((o, i) => (
                  <tr key={i} className="border-b border-[#eee]">
                    <td className="px-1 py-0.5">
                      <input value={o.key_label} onChange={(e) => setOpt(i, 'key_label', e.target.value)}
                        placeholder="SABOR CHOCOLATE" className="w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px]" />
                    </td>
                    <td className="px-1 py-0.5">
                      <input value={o.print_label} onChange={(e) => setOpt(i, 'print_label', e.target.value)}
                        placeholder="o que sai na comanda" className="w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px]" />
                    </td>
                    <td className="px-1 py-0.5 w-[80px]">
                      <input type="number" value={o.sort_order ?? 0} onChange={(e) => setOpt(i, 'sort_order', Number(e.target.value))}
                        className="w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px]" />
                    </td>
                    <td className="px-1 py-0.5 w-[170px]">
                      <select value={o.printer || ''} onChange={(e) => setOpt(i, 'printer', Number(e.target.value) || null)}
                        className="w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px] bg-white">
                        <option value="">—</option>
                        {printers.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-0.5 text-center w-[70px]">
                      <input type="checkbox" checked={!!o.on_emenu} onChange={(e) => setOpt(i, 'on_emenu', e.target.checked)} className="w-4 h-4" />
                    </td>
                    <td className="px-2 text-center">
                      <button onClick={() => delOpt(i)} className="text-red-600 font-bold text-[11px]">Apagar</button>
                    </td>
                  </tr>
                ))}
                {opts.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-[#999] py-8">Sem modelos. Carregue em "Adicionar".</td></tr>
                )}
              </tbody>
            </table>

            <div className="w-[150px] flex-shrink-0 border-l border-[#e0e0e0] p-2 space-y-2">
              <button onClick={addOpt} className="flex items-center gap-2 text-[13px] text-[#333] hover:bg-[#f0f0f0] w-full px-1 py-1">
                <span className="w-6 h-6 rounded-full bg-[#2b2b2b] text-white flex items-center justify-center text-[14px]">＋</span>
                Adicionar
              </button>
              <button onClick={() => opts.length && delOpt(opts.length - 1)} disabled={!opts.length}
                className="flex items-center gap-2 text-[13px] text-[#333] hover:bg-[#f0f0f0] w-full px-1 py-1 disabled:opacity-35">
                <span className="w-6 h-6 rounded-full bg-[#c0392b] text-white flex items-center justify-center text-[14px]">−</span>
                Apagar
              </button>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-[#666] mt-2">
          A <b>Tecla</b> é o que o operador vê; a <b>Impressão</b> é o que sai na comanda da <b>Impressora</b> escolhida.
        </div>
      </div>

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
