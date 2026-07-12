import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';

const inp = 'border border-[#c8c8c8] px-1.5 py-1 text-[12px] w-full bg-white';

/**
 * MANUTENÇÃO — criação e alteração RÁPIDA de artigos, em massa.
 *
 * Um hotel a abrir tem 800 artigos para lançar. Um a um, na ficha completa, são dias
 * de trabalho. Aqui define-se UMA VEZ o que é comum (grupo, família, IVA, venda/compra)
 * e escrevem-se só as linhas que mudam: código, descrição, PLU e os preços.
 */
export default function Maintenance() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'create' | 'update' | 'prices'>('create');
  const [common, setCommon] = useState<any>({ is_active: true, is_sold: true, is_purchased: true, tax_percentage: 14 });
  const [lines, setLines] = useState<any[]>([{ code: '', name: '', plu_code: '', p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 }]);
  const [result, setResult] = useState<{ ok: number; fail: number; errors: string[] }>({ ok: 0, fail: 0, errors: [] });

  const { data: groups = [] } = useQuery({ queryKey: ['posc', 'groups'], queryFn: async () => (await apiClient.get('inventory/pos/groups/')).data });
  const { data: families = [] } = useQuery({ queryKey: ['posc', 'families'], queryFn: async () => (await apiClient.get('inventory/pos/families/')).data });
  const { data: subs = [] } = useQuery({ queryKey: ['posc', 'subs'], queryFn: async () => (await apiClient.get('inventory/pos/subfamilies/')).data });
  const { data: uoms = [] } = useQuery({ queryKey: ['posc', 'uoms'], queryFn: async () => { const r = await apiClient.get('inventory/uoms/'); return r.data?.results || r.data || []; } });

  const setLine = (i: number, k: string, v: any) => setLines((ls) => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));
  const addLine = () => setLines((ls) => [...ls, { code: '', name: '', plu_code: '', p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 }]);
  const delLine = (i: number) => setLines((ls) => ls.filter((_, j) => j !== i));

  const run = useMutation({
    mutationFn: async () => {
      let ok = 0, fail = 0; const errors: string[] = [];
      for (const l of lines) {
        if (!l.code && !l.name) continue;
        try {
          const body: any = {
            code: l.code, name: l.name, plu_code: l.plu_code || null,
            subfamily: common.subfamily || null,
            tax_percentage: common.tax_percentage,
            is_active: common.is_active, is_sold: common.is_sold, is_purchased: common.is_purchased,
            item_type: 'Retail',
            base_uom: common.base_uom || uoms[0]?.id,
            sale_price: Number(l.p1) || 0,
          };
          const r = mode === 'create'
            ? await apiClient.post('inventory/pos/articles/', body)
            : await apiClient.patch(`inventory/pos/articles/${l.id}/`, body);
          const prices = [1, 2, 3, 4, 5].map((n) => ({ level: n, price: Number(l[`p${n}`]) || 0 })).filter((p) => p.price > 0 || p.level === 1);
          await apiClient.post(`inventory/pos/articles/${r.data.id}/set_prices/`, { prices });
          ok++;
        } catch (e: any) {
          fail++;
          errors.push(`${l.code || '(sem código)'}: ${JSON.stringify(e?.response?.data ?? e?.message).slice(0, 90)}`);
        }
      }
      return { ok, fail, errors };
    },
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({
        title: 'Manutenção concluída',
        message: `${r.ok} artigo(s) gravados${r.fail ? `, ${r.fail} com erro` : ''}.`,
        hint: r.fail ? r.errors.slice(0, 3).join('\n') : 'Os artigos já estão disponíveis no POS.',
      });
      if (!r.fail) setLines([{ code: '', name: '', plu_code: '', p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 }]);
    },
    onError: notifyError,
  });

  const Common = ({ label, children }: any) => (
    <tr className="border-b border-[#eee]">
      <td className="px-2 py-1 text-[12px] text-[#333] w-[120px] border-r border-[#eee]">{label}</td>
      <td className="px-2 py-1">{children}</td>
    </tr>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Tipo */}
      <div className="flex items-center gap-8 px-4 py-3 border-b border-[#d0d0d0] text-[13px]">
        <span className="text-[#333]">Tipo:</span>
        {([['create', 'Criação rápida de artigos'], ['update', 'Alteração rápida de artigos'], ['prices', 'Alterações de Preço']] as const).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={mode === k} onChange={() => setMode(k)} className="w-4 h-4" />
            {label}
          </label>
        ))}
      </div>

      <div className="px-4 py-2 bg-[#e9e9e9] border-b border-[#d0d0d0] text-[13px] font-bold text-[#333]">
        {mode === 'create' ? 'Criação rápida de artigos' : mode === 'update' ? 'Alteração rápida de artigos' : 'Alterações de Preço'}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Dados comuns */}
        <div className="w-[380px] flex-shrink-0 border-r border-[#d0d0d0] flex flex-col">
          <div className="px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0] text-[13px] font-bold text-[#333]">Dados Comuns</div>
          <div className="flex-1 overflow-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#f7f7f7] text-[12px] text-[#333]">
                  <th className="text-left px-2 py-1 border-b border-[#e0e0e0] font-normal">Descrição</th>
                  <th className="text-left px-2 py-1 border-b border-[#e0e0e0] font-normal">Valor</th>
                </tr>
              </thead>
              <tbody>
                <Common label="Ativo">
                  <input type="checkbox" checked={!!common.is_active} onChange={(e) => setCommon({ ...common, is_active: e.target.checked })} className="w-4 h-4" />
                </Common>
                <Common label="Grupo">
                  <select value={common.group || ''} onChange={(e) => setCommon({ ...common, group: e.target.value, family: '', subfamily: '' })} className={inp}>
                    <option value="">(nenhum)</option>
                    {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </Common>
                <Common label="Família">
                  <select value={common.family || ''} onChange={(e) => setCommon({ ...common, family: e.target.value, subfamily: '' })} className={inp}>
                    <option value="">(nenhum)</option>
                    {families.filter((f: any) => !common.group || f.group === Number(common.group))
                      .map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </Common>
                <Common label="Sub Família">
                  <select value={common.subfamily || ''} onChange={(e) => setCommon({ ...common, subfamily: Number(e.target.value) || '' })} className={inp}>
                    <option value="">(nenhum)</option>
                    {subs.filter((s: any) => !common.family || s.family === Number(common.family))
                      .map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Common>
                <Common label="Iva 1">
                  <input type="number" value={common.tax_percentage ?? ''} onChange={(e) => setCommon({ ...common, tax_percentage: e.target.value })} className={inp} />
                </Common>
                <Common label="Unidade">
                  <select value={common.base_uom || ''} onChange={(e) => setCommon({ ...common, base_uom: Number(e.target.value) || '' })} className={inp}>
                    <option value="">(nenhum)</option>
                    {uoms.map((u: any) => <option key={u.id} value={u.id}>{u.code}</option>)}
                  </select>
                </Common>
                <Common label="Venda">
                  <input type="checkbox" checked={!!common.is_sold} onChange={(e) => setCommon({ ...common, is_sold: e.target.checked })} className="w-4 h-4" />
                </Common>
                <Common label="Compra">
                  <input type="checkbox" checked={!!common.is_purchased} onChange={(e) => setCommon({ ...common, is_purchased: e.target.checked })} className="w-4 h-4" />
                </Common>
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-[#666] p-2 border-t border-[#e0e0e0]">
            O que é comum define-se aqui uma vez; em baixo escreve-se só o que muda.
          </div>
        </div>

        {/* Linhas */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead className="sticky top-0">
                <tr className="bg-[#f0f0f0] text-[#333]">
                  {['Código', 'Descrição', 'Código PLU', 'Preço 1', 'Preço 2', 'Preço 3', 'Preço 4', 'Preço 5'].map((h) => (
                    <th key={h} className="text-left font-normal px-2 py-1.5 border border-[#d5d5d5]">{h}</th>
                  ))}
                  <th className="border border-[#d5d5d5] w-[40px]" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="border border-[#e5e5e5] p-0.5"><input value={l.code} onChange={(e) => setLine(i, 'code', e.target.value)} className={inp} /></td>
                    <td className="border border-[#e5e5e5] p-0.5"><input value={l.name} onChange={(e) => setLine(i, 'name', e.target.value)} className={inp} /></td>
                    <td className="border border-[#e5e5e5] p-0.5 w-[110px]"><input value={l.plu_code} onChange={(e) => setLine(i, 'plu_code', e.target.value)} className={inp} /></td>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <td key={n} className="border border-[#e5e5e5] p-0.5 w-[90px]">
                        <input type="number" value={l[`p${n}`]} onChange={(e) => setLine(i, `p${n}`, e.target.value)} className={`${inp} text-right`} />
                      </td>
                    ))}
                    <td className="border border-[#e5e5e5] text-center">
                      <button onClick={() => delLine(i)} className="text-red-600 font-bold">−</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addLine} className="flex items-center gap-2 m-2 text-[13px] text-[#333]">
              <span className="w-6 h-6 rounded-full bg-[#2b2b2b] text-white flex items-center justify-center">＋</span>
              Acrescentar linha
            </button>
          </div>

          <div className="flex items-center gap-4 px-3 py-2 border-t border-[#d0d0d0] bg-[#f4f4f4] text-[13px]">
            <button onClick={() => run.mutate()} disabled={run.isPending}
              className="flex items-center gap-2 font-semibold text-[#1f7a34] disabled:opacity-50">
              <span className="w-7 h-7 rounded-full bg-[#1f7a34] text-white flex items-center justify-center">✔</span>
              {run.isPending ? 'A gravar…' : 'Gravar'}
            </button>
            <span className="opacity-30">|</span>
            <span>Estado:</span>
            <span className="flex items-center gap-1"><span className="w-5 h-5 rounded-full bg-[#29b6f6] text-white text-[11px] flex items-center justify-center">·</span>{lines.length}</span>
            <span className="flex items-center gap-1"><span className="w-5 h-5 rounded-full bg-[#1f7a34] text-white text-[11px] flex items-center justify-center">✔</span>{result.ok}</span>
            <span className="flex items-center gap-1"><span className="w-5 h-5 rounded-full bg-[#c0392b] text-white text-[11px] flex items-center justify-center">✖</span>{result.fail}</span>
            <button onClick={() => { setLines([{ code: '', name: '', plu_code: '', p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 }]); setResult({ ok: 0, fail: 0, errors: [] }); }}
              className="ml-auto flex items-center gap-2 text-[#c0392b] font-semibold">
              <span className="w-6 h-6 rounded-full bg-[#c0392b] text-white flex items-center justify-center">−</span> Limpar tudo
            </button>
          </div>
          {result.errors.length > 0 && (
            <div className="px-3 py-2 bg-[#fdeaea] border-t border-[#e0a0a0] text-[11px] text-[#a01818] max-h-[80px] overflow-auto">
              {result.errors.map((e, i) => <div key={i}>• {e}</div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
