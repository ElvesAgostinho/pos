import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { inputStyle, Box, SearchButton } from './kit';
import { TOKENS } from '../../config/theme';

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
            ? 'bg-[#18181B] text-white' : 'bg-[#242428] text-white/80 hover:bg-[#18181B]'}`}>
          Recalcular
        </button>
        <button onClick={() => setOp('saft')}
          className={`w-full py-4 text-[14px] font-semibold ${op === 'saft'
            ? 'bg-[#18181B] text-white' : 'bg-[#242428] text-white/80 hover:bg-[#18181B]'}`}>
          SAF-T — Comunicação de Inventário
        </button>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {op === 'recalc' ? (
          <>
            <div className="p-4 border-b border-[#e0e0e0]">
              <Box title="Recalcular o stock" className="max-w-[900px]">
                <div className="flex items-end gap-6 pt-1.5">
                  <div className="grid grid-cols-1 gap-y-2">
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

                  <label className="text-[12px]">
                    <div className="text-[#333] mb-1">Armazém:</div>
                    <select multiple value={warehouses.map(String)} size={4}
                      onChange={(e) => setWarehouses(Array.from(e.target.selectedOptions, (o) => Number(o.value)))}
                      className={`${inp} w-[240px]`} style={inputStyle}>
                      {(armazens as any[]).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <div className="text-[11px] text-[#666] mt-1">Nenhum selecionado = todos.</div>
                  </label>

                  <SearchButton onClick={() => correr.mutate()} disabled={nada || correr.isPending}
                    label={correr.isPending ? 'A recalcular…' : 'Começar'} className="w-[150px] h-[76px]" />
                </div>

                {nada && (
                  <div className="text-[11px] text-[#8a6100] mt-3">
                    Escolha o que quer recalcular. Nada é feito às cegas.
                  </div>
                )}
              </Box>
            </div>

            <div className="px-3 py-1.5 border-y border-[#d0d0d0] text-[13px] font-bold"
              style={{ background: 'linear-gradient(to bottom, #fbfbfc 0%, #eef0f2 55%, #e2e5e9 100%)', color: TOKENS.selectedText }}>
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
          <InventarioAgt />
        )}
      </div>
    </div>
  );
}

/**
 * COMUNICAÇÃO DE INVENTÁRIO À AGT — o ficheiro das existências, gerado AQUI.
 *
 * O POS é o dono do stock (armazéns + custo médio): o ficheiro StockFile nasce do
 * mesmo motor que os armazéns usam — código, descrição, unidade, quantidade e valor
 * de fecho por artigo. Escolhe-se o ano, vê-se o resumo, descarrega-se o XML e
 * carrega-se no portal da AGT.
 */
function InventarioAgt() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const { data: meta } = useQuery({
    queryKey: ['fnb', 'inv-saft', ano],
    queryFn: async () => (await apiClient.get('pos/fnb/stock-saft/', { params: { year: ano, meta: 1 } })).data,
  });

  const descarregar = async () => {
    try {
      const r = await apiClient.get('pos/fnb/stock-saft/', { params: { year: ano }, responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url; a.download = `inventario_${ano}.xml`; a.click();
      URL.revokeObjectURL(url);
      notifyGuide({ title: 'Inventário gerado', message: `Ficheiro do ano ${ano} descarregado — carregue-o no portal da AGT.` });
    } catch (e: any) { notifyError(e); }
  };

  return (
    <div className="flex-1 p-4">
      <Box title="SAF-T — Comunicação de Inventário (AGT)" className="max-w-[700px]">
        <div className="space-y-3 text-[12px] text-[#333] pt-1.5">
          <p>A AGT exige a comunicação anual das existências. O ficheiro sai <b>daqui</b>,
            do stock real dos armazéns, valorizado ao custo médio.</p>
          <div className="flex items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[#666]">Ano fiscal</span>
              <input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))}
                className="h-8 w-[110px] px-2 border border-[#8a95a3]" style={inputStyle} />
            </label>
            <button onClick={descarregar}
              className="h-8 px-5 text-[13px] font-bold text-[#18181B] hover:brightness-110"
              style={{ background: TOKENS.gold }}>
              ⬇ Gerar e descarregar o XML
            </button>
          </div>
          {meta && (
            <div className="bg-white p-3 grid grid-cols-3 gap-2 text-[12px]" style={{ border: '4px groove #c0c0c0' }}>
              <div><span className="text-[#666]">Artigos com existência</span><br /><b>{meta.items}</b></div>
              <div><span className="text-[#666]">Valor total (custo médio)</span><br /><b>{Number(meta.total_value).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} Kz</b></div>
              <div><span className="text-[#666]">Empresa / NIF</span><br /><b>{meta.company}</b> · {meta.nif}</div>
            </div>
          )}
          <div className="text-[11px] text-[#666]">
            O SAF-T de <b>vendas</b> continua a sair em Utilitários › SAFT-AO — são dois
            ficheiros diferentes que a AGT pede: um é o que se vendeu, este é o que ficou.
          </div>
        </div>
      </Box>
    </div>
  );
}
