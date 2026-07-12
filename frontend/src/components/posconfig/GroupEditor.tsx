import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputCls, inputStyle } from './kit';

const cell = 'w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px] bg-white';

/**
 * GRUPO (Parâmetros do Sistema) — o topo da estrutura.
 *
 * Define-se aqui, uma vez para todos os hotéis do grupo:
 *   · LÍNGUAS — em que idioma o sistema fala com o hóspede (menu digital, fatura,
 *     confirmação de reserva). A "por omissão" é a que ele usa quando não sabe outra.
 *   · MOEDAS — em que se aceita pagar, e a taxa face à moeda base.
 */
export default function GroupEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [d, setD] = useState<any>({ sort_order: 100, is_active: true, languages: [], currencies: [], ...row });
  const [tab, setTab] = useState<'lang' | 'cur'>('lang');

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('org/pos/groups/', d)
      : apiClient.patch(`org/pos/groups/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({ title: 'Grupo gravado', message: 'As línguas e as moedas passam a valer para todos os hotéis do grupo.' });
      onClose();
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const list: any[] = tab === 'lang' ? (d.languages || []) : (d.currencies || []);
  const key = tab === 'lang' ? 'languages' : 'currencies';
  const setRow = (i: number, k: string, v: any) => set(key, list.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const add = () => set(key, [...list, tab === 'lang'
    ? { culture_code: '', name: '', sort_order: 100, legacy_code: '', is_default: false }
    : { code: '', name: '', symbol: '', rate: 1, sort_order: 100, is_default: false }]);
  const del = (i: number) => set(key, list.filter((_, j) => j !== i));
  // Só pode haver UMA por omissão — senão o sistema não sabe qual usar.
  const setDefault = (i: number) => set(key, list.map((r, j) => ({ ...r, is_default: j === i })));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Novo grupo' : `A editar ${d.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Identificação */}
        <div className="space-y-2 mb-4">
          <label className="flex items-start gap-3 text-[13px]">
            <span className="w-[110px] text-[#333] pt-1">Código:</span>
            <input value={d.code || ''} onChange={(e) => set('code', e.target.value)}
              className={`${inputCls} w-[640px] flex-none`} style={inputStyle} />
          </label>
          <label className="flex items-start gap-3 text-[13px]">
            <span className="w-[110px] text-[#333] pt-1">Descrição:<span className="text-[#a01818]">*</span></span>
            <textarea value={d.name || ''} onChange={(e) => set('name', e.target.value)} rows={3}
              className="border border-[#8a95a3] px-2 py-1 text-[12px] bg-white w-[640px]" style={inputStyle} />
          </label>
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-[110px] text-[#333]">Ordem:</span>
            <input type="number" value={d.sort_order ?? 100} onChange={(e) => set('sort_order', Number(e.target.value))}
              className={`${inputCls} w-[160px] flex-none`} style={inputStyle} />
          </label>
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-[110px] text-[#333]">Ativo:</span>
            <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
          </label>
        </div>

        {/* Línguas / Moedas */}
        <div className="flex">
          {([['lang', 'Línguas'], ['cur', 'Moedas']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-8 py-2 text-[13px] font-semibold ${tab === k ? 'bg-[#3c3c3c] text-white' : 'bg-[#e8e8e8] text-[#555] hover:bg-[#ddd]'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="border border-[#c0c0c0] flex">
          <table className="flex-1 text-[12px] border-collapse">
            <thead>
              <tr className="bg-[#f4f4f4] text-[#333]">
                {(tab === 'lang'
                  ? ['Código de Cultura', 'Descrição', 'Ordem', 'Legacy Code', 'Por omissão']
                  : ['Código', 'Descrição', 'Símbolo', 'Taxa', 'Por omissão']
                ).map((h) => <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">{h}</th>)}
                <th className="w-[50px] border-b border-[#d0d0d0]" />
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={i} className="border-b border-[#eee]">
                  {tab === 'lang' ? (
                    <>
                      <td className="p-0.5"><input value={r.culture_code} onChange={(e) => setRow(i, 'culture_code', e.target.value)} placeholder="pt-PT" className={cell} /></td>
                      <td className="p-0.5"><input value={r.name} onChange={(e) => setRow(i, 'name', e.target.value)} placeholder="Portuguese (Portugal)" className={cell} /></td>
                      <td className="p-0.5 w-[90px]"><input type="number" value={r.sort_order ?? 100} onChange={(e) => setRow(i, 'sort_order', Number(e.target.value))} className={cell} /></td>
                      <td className="p-0.5 w-[110px]"><input value={r.legacy_code || ''} onChange={(e) => setRow(i, 'legacy_code', e.target.value)} className={cell} /></td>
                    </>
                  ) : (
                    <>
                      <td className="p-0.5 w-[90px]"><input value={r.code} onChange={(e) => setRow(i, 'code', e.target.value.toUpperCase())} placeholder="AOA" className={cell} /></td>
                      <td className="p-0.5"><input value={r.name} onChange={(e) => setRow(i, 'name', e.target.value)} placeholder="Kwanza" className={cell} /></td>
                      <td className="p-0.5 w-[80px]"><input value={r.symbol || ''} onChange={(e) => setRow(i, 'symbol', e.target.value)} placeholder="Kz" className={cell} /></td>
                      <td className="p-0.5 w-[120px]"><input type="number" step="0.000001" value={r.rate ?? 1} onChange={(e) => setRow(i, 'rate', e.target.value)} className={`${cell} text-right`} /></td>
                    </>
                  )}
                  <td className="px-2 text-center w-[100px]">
                    <input type="radio" checked={!!r.is_default} onChange={() => setDefault(i)} className="w-4 h-4" />
                  </td>
                  <td className="px-2 text-center">
                    <button onClick={() => del(i)} className="text-red-600 font-bold text-[11px]">−</button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={6} className="text-center text-[#999] py-8">Sem registos. Carregue em "Adicionar".</td></tr>
              )}
            </tbody>
          </table>

          <div className="w-[150px] flex-shrink-0 border-l border-[#e0e0e0] p-2 space-y-1">
            <button onClick={add} className="flex items-center gap-2 text-[13px] w-full px-1 py-1 hover:bg-[#f0f0f0]">
              <span className="w-6 h-6 rounded-full bg-[#2b2b2b] text-white flex items-center justify-center">＋</span> Adicionar
            </button>
            <button onClick={() => list.length && del(list.length - 1)} disabled={!list.length}
              className="flex items-center gap-2 text-[13px] w-full px-1 py-1 hover:bg-[#f0f0f0] disabled:opacity-35">
              <span className="w-6 h-6 rounded-full bg-[#c0392b] text-white flex items-center justify-center">−</span> Apagar
            </button>
          </div>
        </div>

        <div className="text-[11px] text-[#666] mt-2">
          {tab === 'lang'
            ? 'A língua "por omissão" é aquela em que o sistema fala quando não conhece a do hóspede.'
            : 'A taxa é face à moeda base (a que está "por omissão"). É por ela que se convertem os pagamentos em divisas.'}
        </div>
      </div>

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
