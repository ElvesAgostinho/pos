import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { inputStyle } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';

/**
 * UTILITÁRIOS DE F&B — RECALCULAR O STOCK.
 *
 * O saldo e o custo médio são números DERIVADOS: saem dos movimentos, que são a
 * verdade. Quando um saldo aparece torto (uma correção antiga, um movimento
 * apagado), refaz-se a conta do zero — em vez de se emendar o número à mão.
 *
 * Emendar à mão é como se escondem furos: o número fica bonito e a mercadoria
 * continua a faltar.
 */
export default function FnbUtilities() {
  const qc = useQueryClient();
  const [op, setOp] = useState<'recalc' | 'saft'>('recalc');
  const [d, setD] = useState<any>({ cost_items: false, cost_sales: false, stock_qty: false });
  const [warehouses, setWarehouses] = useState<number[]>([]);
  const [resultado, setResultado] = useState<any>(null);

  const { data: armazens = [] } = useQuery({
    queryKey: ['posc', 'warehouses'],
    queryFn: async () => (await apiClient.get('pos/config/warehouses/')).data,
  });

  const correr = useMutation({
    mutationFn: () => apiClient.post('pos/config/stock-recalc/', { ...d, warehouses }),
    onSuccess: (r: any) => {
      setResultado(r.data);
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({ title: 'Recálculo terminado', message: r.data.detail });
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const nada = !d.cost_items && !d.cost_sales && !d.stock_qty;

  return (
    <div className="flex-1 flex overflow-hidden bg-white">
      {/* Operações */}
      <div className="w-[300px] flex-shrink-0 border-r border-[#d0d0d0] p-3 space-y-2 bg-[#fafafa]">
        <button onClick={() => setOp('recalc')}
          className={`w-full py-4 text-[14px] font-semibold ${op === 'recalc'
            ? 'bg-[#2b2b2b] text-white' : 'bg-[#3c3c3c] text-white/80 hover:bg-[#2b2b2b]'}`}>
          Recalcular
        </button>
        <button onClick={() => setOp('saft')}
          className={`w-full py-4 text-[14px] font-semibold ${op === 'saft'
            ? 'bg-[#2b2b2b] text-white' : 'bg-[#3c3c3c] text-white/80 hover:bg-[#2b2b2b]'}`}>
          SAF-T — Comunicação de Inventário
        </button>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {op === 'recalc' ? (
          <>
            <div className="px-3 py-1.5 bg-[#e9e9e9] text-[13px] font-bold text-[#333] border-b border-[#d0d0d0]">
              Recalcular o stock
            </div>

            <div className="p-4 border-b border-[#e0e0e0]">
              <div className="grid grid-cols-2 gap-x-10 gap-y-2 max-w-[700px]">
                <label className="flex items-center gap-2 text-[12px]">
                  <input type="checkbox" checked={d.cost_items} onChange={(e) => set('cost_items', e.target.checked)} className="w-4 h-4" />
                  Custo - Artigos
                  <span className="text-[11px] text-[#888]">(custo médio ponderado)</span>
                </label>
                <label className="flex items-center gap-2 text-[12px]">
                  <input type="checkbox" checked={d.cost_sales} onChange={(e) => set('cost_sales', e.target.checked)} className="w-4 h-4" />
                  Custo - Vendas
                </label>
                <label className="flex items-center gap-2 text-[12px]">
                  <input type="checkbox" checked={d.stock_qty} onChange={(e) => set('stock_qty', e.target.checked)} className="w-4 h-4" />
                  Stock Qtd. - Vendas
                  <span className="text-[11px] text-[#888]">(saldo por armazém)</span>
                </label>
              </div>

              <div className="flex items-end gap-4 mt-4">
                <label className="text-[12px]">
                  <div className="text-[#333] mb-1">Armazém:</div>
                  <select multiple value={warehouses.map(String)} size={4}
                    onChange={(e) => setWarehouses(Array.from(e.target.selectedOptions, (o) => Number(o.value)))}
                    className={`${inp} w-[280px]`} style={inputStyle}>
                    {(armazens as any[]).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                  <div className="text-[11px] text-[#666] mt-1">Nenhum selecionado = todos.</div>
                </label>

                <button onClick={() => correr.mutate()} disabled={nada || correr.isPending}
                  className="px-8 py-4 bg-[#3c3c3c] text-white text-[14px] font-semibold hover:bg-[#2b2b2b] disabled:opacity-40">
                  {correr.isPending ? 'A recalcular…' : '⟳  Começar'}
                </button>
              </div>

              {nada && (
                <div className="text-[11px] text-[#8a6100] mt-3">
                  Escolha o que quer recalcular. Nada é feito às cegas.
                </div>
              )}
            </div>

            <div className="px-3 py-1.5 bg-[#e9e9e9] text-[13px] font-bold text-[#333] border-y border-[#d0d0d0]">
              Status
            </div>
            <div className="flex-1 overflow-auto">
              {resultado ? (
                <>
                  <div className="px-3 py-2 text-[12px] bg-[#e8f5e9] text-[#1f7a34] border-b border-[#b6d7b9]">
                    {resultado.detail}
                  </div>
                  {resultado.changes?.length > 0 && (
                    <table className="w-full text-[12px] border-collapse">
                      <thead><tr className="bg-[#f4f4f4]">
                        {['Artigo', 'Armazém', 'Campo', 'Antes', 'Depois'].map((h) => (
                          <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {resultado.changes.map((c: any, i: number) => (
                          <tr key={i} className="border-b border-[#eee]">
                            <td className="px-2 py-1">{c.item}</td>
                            <td className="px-2 py-1">{c.warehouse}</td>
                            <td className="px-2 py-1">{c.field}</td>
                            <td className="px-2 py-1 text-right text-[#c0392b] line-through">{c.before}</td>
                            <td className="px-2 py-1 text-right font-bold text-[#1f7a34]">{c.after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              ) : (
                <div className="text-center text-[#999] py-16 text-[13px]">
                  Escolha o que recalcular e carregue em Começar.
                  <div className="text-[11px] mt-2 max-w-[520px] mx-auto">
                    O saldo e o custo são refeitos a partir dos <b>movimentos</b> — e o que estiver
                    errado aparece aqui, com o valor antes e depois.
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 p-4">
            <div className="px-3 py-1.5 bg-[#e9e9e9] text-[13px] font-bold text-[#333] mb-3">
              SAF-T — Comunicação de Inventário
            </div>
            <div className="text-[12px] text-[#333] max-w-[700px] space-y-2">
              <p>
                A AGT exige a comunicação anual do inventário. O ficheiro sai do
                <b> Centro Fiscal → SAF-T</b>, onde já existe o gerador com a estrutura
                oficial e a assinatura.
              </p>
              <div className="text-[11px] text-[#8a6100] bg-[#fff7e6] border border-[#e0c080] px-3 py-2">
                Não dupliquei o gerador aqui: um SAF-T gerado por dois sítios diferentes
                acaba sempre com duas versões da verdade.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
