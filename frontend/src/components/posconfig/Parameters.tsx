import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle } from './kit';

const cell = 'w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px] bg-white';

/**
 * PARÂMETROS DO SISTEMA — é aqui que se liga e desliga o comportamento do POS.
 *
 * Não são decoração: o sistema LÊ-OS de verdade. Por exemplo:
 *   (8128) → anular uma fatura passa a emitir sempre a Nota de Crédito;
 *   (8620) → acima deste desconto, o POS exige a autorização de um supervisor;
 *   (8005) → fecho de caixa CEGO: o operador conta sem ver o esperado.
 *
 * O NÚMERO é a referência estável — é por ele que o suporte fala consigo.
 */
export default function Parameters({ group }: { group?: string } = {}) {
  // `group` filtra o catálogo: o ecrã de Marketing só mostra os parâmetros de
  // Marketing, em vez de despejar os 87 do sistema todo.
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [vals, setVals] = useState<Record<number, any>>({});
  const [dirty, setDirty] = useState<Set<number>>(new Set());

  const { data: groups = [] } = useQuery({
    queryKey: ['posc', 'gparams'],
    queryFn: async () => (await apiClient.get('pos/config/params/')).data,
  });

  useEffect(() => {
    if (!groups.length) return;
    const v: Record<number, any> = {};
    groups.forEach((g: any) => g.params.forEach((p: any) => {
      v[p.number] = p.kind === 'BOOL' ? String(p.value).toLowerCase() === 'true' : (p.value ?? '');
    }));
    setVals(v);
    setDirty(new Set());
  }, [groups]);

  const save = useMutation({
    mutationFn: () => {
      const changed: Record<number, any> = {};
      dirty.forEach((n) => { changed[n] = vals[n]; });
      return apiClient.post('pos/config/params/', { values: changed });
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({
        title: 'Parâmetros gravados',
        message: r.data.detail,
        hint: 'Entram em vigor em segundos — não é preciso reiniciar os terminais.',
      });
      setDirty(new Set());
    },
    onError: notifyError,
  });

  const set = (n: number, v: any) => {
    setVals((o) => ({ ...o, [n]: v }));
    setDirty((d) => new Set(d).add(n));
  };

  const shown = groups
    .filter((g: any) => !group || g.group === group)
    .map((g: any) => ({
      ...g,
      params: g.params.filter((p: any) =>
        !q || `${p.number} ${p.name}`.toLowerCase().includes(q.toLowerCase())),
    }))
    .filter((g: any) => g.params.length > 0);

  const total = groups.reduce((a: number, g: any) => a + g.params.length, 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[#d0d0d0] bg-[#f7f7f7] text-[13px]">
        <span>Pesquisar:</span>
        <div className="flex items-center border border-[#8a95a3] bg-white" style={inputStyle}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="nome ou número (ex.: 8128)"
            className="px-2 py-1 text-[12px] outline-none w-[280px]" />
          <span className="px-2 text-[#666]">🔍</span>
        </div>
        <span className="ml-auto text-[11px] text-[#666]">
          {total} parâmetros · {dirty.size > 0 && <b className="text-[#a01818]">{dirty.size} por gravar</b>}
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#efefef] text-[#333]">
              <th className="text-left font-normal px-3 py-1.5 border-b border-[#d0d0d0]">Descrição</th>
              <th className="text-left font-normal px-3 py-1.5 border-b border-[#d0d0d0] w-[38%]">Valor</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((g: any) => (
              <>
                <tr key={g.group} className="bg-[#e9e9e9]">
                  <td colSpan={2} className="px-3 py-1.5 font-bold text-[#333] border-y border-[#d0d0d0]">{g.group}</td>
                </tr>
                {g.params.map((p: any) => {
                  const v = vals[p.number];
                  const changed = dirty.has(p.number);
                  return (
                    <tr key={p.number} className={`border-b border-[#eee] hover:bg-[#f7f9fb] ${changed ? 'bg-[#fffbe6]' : ''}`}>
                      <td className="px-3 py-1.5" title={p.help_text}>
                        <span className="text-[#666]">({p.number})</span> {p.name}
                        {p.help_text && <div className="text-[10px] text-[#888] mt-0.5">{p.help_text}</div>}
                      </td>
                      <td className="px-3 py-1">
                        {p.kind === 'BOOL' ? (
                          <input type="checkbox" checked={!!v} onChange={(e) => set(p.number, e.target.checked)} className="w-4 h-4" />
                        ) : p.kind === 'CHOICE' ? (
                          <select value={v ?? ''} onChange={(e) => set(p.number, e.target.value)} className={cell}>
                            <option value="">(nenhum)</option>
                            {(p.choices || []).map((c: string) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        ) : (
                          <input type={p.kind === 'INT' ? 'number' : 'text'} value={v ?? ''}
                            onChange={(e) => set(p.number, e.target.value)} placeholder="(nenhum)" className={cell} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={2} className="text-center text-[#999] py-10">Nenhum parâmetro corresponde à pesquisa.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Toolbar
        actions={[
          { icon: '✔', label: save.isPending ? 'A gravar…' : `Gravar${dirty.size ? ` (${dirty.size})` : ''}`, color: '#1f7a34', disabled: !dirty.size, onClick: () => save.mutate() },
        ]}
        right={<span className="text-[11px] text-[#666] pr-2">
          Os parâmetros são lidos pelo sistema em tempo real — entram em vigor em segundos.
        </span>}
      />
    </div>
  );
}
