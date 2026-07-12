import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';
type Tab = 'tables' | 'documents' | 'shortcuts' | 'payments' | 'privacy';

const TABS: [Tab, string][] = [
  ['tables', 'POS - Ecrã de mesas'], ['documents', 'POS - Documentos'],
  ['shortcuts', 'POS - Atalhos barra superior'], ['payments', 'POS - Pagamentos'],
  ['privacy', 'Proteção Dados'],
];

/**
 * GRUPO DE UTILIZADORES — o perfil (Comercial, Manager POS, Cozinha…).
 *
 * As permissões dão-se ao GRUPO, não à pessoa. Quando entra um empregado novo,
 * põe-se no grupo e ele fica com tudo o que precisa — e com nada do que não precisa.
 *
 * À esquerda: as funções do TERMINAL, por separador.
 * À direita: as permissões NUMERADAS do sistema (20258 = permitir alterar preço).
 */
export default function UserGroupEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [tab, setTab] = useState<Tab>('tables');
  const [d, setD] = useState<any>({
    is_active: true, number: 0, right_ids: [],
    pos_tables: {}, pos_documents: {}, pos_shortcuts: {}, pos_payments: {}, data_protection: {},
    ...row,
  });

  const { data: cat } = useQuery({
    queryKey: ['posc', 'rights'],
    queryFn: async () => (await apiClient.get('pos/config/user-groups/rights_catalog/')).data,
  });
  const { data: methods = [] } = useQuery({
    queryKey: ['posc', 'paymethods'],
    queryFn: async () => { try { const r = await apiClient.get('mdm/payment-methods/'); return r.data?.results || r.data || []; } catch { return []; } },
  });

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/user-groups/', d)
      : apiClient.patch(`pos/config/user-groups/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({ title: 'Grupo gravado', message: 'Todos os utilizadores deste grupo passam a ter estas permissões — não é preciso mexer um a um.' });
      onClose();
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const rights: any[] = cat?.rights || [];
  const chosen: number[] = d.right_ids || [];
  const roots = rights.filter((r) => !r.parent);

  const toggleRight = (id: number) => {
    // Ligar um filho liga o pai — senão a permissão nunca chegava a aparecer no menu.
    const r = rights.find((x) => x.id === id);
    let next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    if (!chosen.includes(id) && r?.parent && !next.includes(r.parent)) next = [...next, r.parent];
    // Desligar um pai desliga os filhos (não faz sentido "Adicionar artigo" sem "Artigos").
    if (chosen.includes(id)) {
      const kids = rights.filter((x) => x.parent === id).map((x) => x.id);
      next = next.filter((x) => !kids.includes(x));
    }
    set('right_ids', next);
  };

  const boxKey: Record<Tab, string> = {
    tables: 'pos_tables', documents: 'pos_documents', shortcuts: 'pos_shortcuts',
    payments: 'pos_payments', privacy: 'data_protection',
  };
  const boxes: string[] = tab === 'payments'
    ? ['(Todos)', ...methods.map((m: any) => m.name)]
    : (cat?.[tab === 'tables' ? 'pos_tables' : tab === 'documents' ? 'pos_documents' : 'pos_shortcuts'] || []);
  const vals = d[boxKey[tab]] || {};
  const setBox = (name: string, v: any) => set(boxKey[tab], { ...vals, [name]: v });

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Novo grupo' : `A editar ${d.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Esquerda: identificação + funções do terminal */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-[#e0e0e0]">
          <div className="p-4 space-y-2">
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-3 text-[13px]">
                <span className="w-[70px] text-[#333]">Nr:</span>
                <input type="number" value={d.number ?? 0} onChange={(e) => set('number', Number(e.target.value))} className={`${inp} w-[130px]`} style={inputStyle} />
              </label>
              <label className="flex items-center gap-2 text-[13px] ml-auto">
                <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
                Ativo
              </label>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-3 text-[13px]">
                <span className="w-[70px] text-[#333]">Código:<span className="text-[#a01818]">*</span></span>
                <input value={d.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())} className={`${inp} w-[160px]`} style={inputStyle} />
              </label>
              <label className="flex items-center gap-3 text-[13px] ml-auto">
                <span className="text-[#333]">Por defeito:</span>
                <select value={d.default_module || ''} onChange={(e) => set('default_module', e.target.value)} className={`${inp} w-[190px]`} style={inputStyle}>
                  <option value="">—</option>
                  {(cat?.modules || ['POS']).map((m: string) => <option key={m} value={m}>{m}</option>)}
                  <option value="PMS">PMS</option>
                </select>
              </label>
            </div>
            <label className="flex items-center gap-3 text-[13px]">
              <span className="w-[70px] text-[#333]">Descrição:<span className="text-[#a01818]">*</span></span>
              <input value={d.name || ''} onChange={(e) => set('name', e.target.value)} className={`${inp} flex-1`} style={inputStyle} />
            </label>
            <label className="flex items-start gap-3 text-[13px]">
              <span className="w-[70px] text-[#333] pt-1">Memo:</span>
              <textarea value={d.memo || ''} onChange={(e) => set('memo', e.target.value)} rows={3} className={`${inp} flex-1`} style={inputStyle} />
            </label>
          </div>

          <div className="flex border-b-2 border-[#2b2b2b] px-2 overflow-x-auto">
            {TABS.map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap border-b-[3px] ${tab === k ? 'border-[#2b2b2b] text-[#111] bg-white' : 'border-transparent text-[#666] hover:text-[#111]'}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto">
            {tab === 'privacy' ? (
              <table className="w-full text-[12px] border-collapse">
                <thead className="sticky top-0"><tr className="bg-[#f4f4f4]">
                  {['Permission', 'Leitura', 'Escrita', 'Info'].map((h) => (
                    <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(cat?.data_protection || []).map((p: any) => {
                    const v = vals[p.code] || {};
                    return (
                      <tr key={p.code} className="border-b border-[#eee]">
                        <td className="px-2 py-1.5 font-bold">{p.code} - {p.name}</td>
                        <td className="text-center"><input type="checkbox" checked={!!v.read} onChange={(e) => setBox(p.code, { ...v, read: e.target.checked })} className="w-4 h-4" /></td>
                        <td className="text-center"><input type="checkbox" checked={!!v.write} onChange={(e) => setBox(p.code, { ...v, write: e.target.checked })} className="w-4 h-4" /></td>
                        <td className="px-2 py-1.5 text-[11px] text-[#666]">{p.info}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-[12px] border-collapse">
                <tbody>
                  {boxes.map((b) => (
                    <tr key={b} className="border-b border-[#eee] hover:bg-[#f7f9fb]">
                      <td className="w-[50px] text-center py-1.5">
                        <input type="checkbox" checked={!!vals[b]} onChange={(e) => setBox(b, e.target.checked)} className="w-4 h-4" />
                      </td>
                      <td className="px-2 py-1.5">{b}</td>
                    </tr>
                  ))}
                  {boxes.length === 0 && <tr><td className="text-center text-[#999] py-8">Sem funções.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Direita: permissões numeradas */}
        <div className="w-[420px] flex-shrink-0 flex flex-col">
          <div className="px-3 py-1.5 bg-[#e9e9e9] text-[13px] font-bold text-[#333] border-b border-[#d0d0d0]">Permissões</div>
          <div className="flex-1 overflow-auto">
            {roots.map((r) => {
              const kids = rights.filter((k) => k.parent === r.id);
              return (
                <div key={r.id}>
                  <label className="flex items-center gap-2 px-2 py-1.5 border-b border-[#eee] text-[12px] hover:bg-[#f7f9fb] cursor-pointer">
                    <input type="checkbox" checked={chosen.includes(r.id)} onChange={() => toggleRight(r.id)} className="w-4 h-4" />
                    <span className="text-[#666] font-mono">{r.number}</span>={r.name}
                  </label>
                  {kids.map((k) => (
                    <label key={k.id} className="flex items-center gap-2 pl-8 pr-2 py-1.5 border-b border-[#f4f4f4] text-[12px] hover:bg-[#f7f9fb] cursor-pointer">
                      <input type="checkbox" checked={chosen.includes(k.id)} onChange={() => toggleRight(k.id)} className="w-4 h-4" />
                      <span className="text-[#666] font-mono">{k.number}</span>={k.name}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
          <button onClick={() => set('right_ids', chosen.length === rights.length ? [] : rights.map((r) => r.id))}
            className="py-2 bg-[#f0f0f0] border-t border-[#d0d0d0] text-[13px] hover:bg-[#e6e6e6]">
            {chosen.length === rights.length ? 'Desmarcar Tudo' : 'Selecionar Tudo'}
          </button>
          <div className="px-3 py-1.5 text-[11px] text-[#666] border-t border-[#eee]">
            {chosen.length} de {rights.length} permissões · o número é a referência do suporte.
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
