import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, GridCheck } from './kit';
import { ItemPicker } from './Pickers';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';

function Row({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex items-center gap-3 text-[12px]">
      <span className="w-[130px] flex-shrink-0 text-[#333]">{label}</span>
      {children}
    </label>
  );
}

/**
 * DESCONTO — o desconto AUTORIZADO, com nome, prazo, dono e âmbito.
 *
 * A diferença entre um hotel que ganha dinheiro e um que não ganha está aqui.
 * Sem isto, o desconto é um número que o empregado escreve à mão e que ninguém
 * consegue explicar ao fim do mês. Com isto:
 *   · tem CÓDIGO — sai nos relatórios pelo nome ("Desconto Staff", não "10%");
 *   · tem PRAZO — fora dele o servidor recusa;
 *   · tem DONO — só os grupos marcados o podem aplicar;
 *   · tem ÂMBITO — o separador F&B limita-o a certos artigos.
 */
export default function DiscountEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [tab, setTab] = useState<'groups' | 'fnb'>('groups');
  const [picker, setPicker] = useState(false);
  const [d, setD] = useState<any>({
    is_active: true, number: 0, base: 'PERCENT', value: 0, calc_mode: 'GENERAL',
    for_pms: false, for_ems: false, for_pos: true, allow_manual: false,
    set_nights: false, use_intervals: false, stay_nights: 0, paid_nights: 0,
    group_ids: [], item_ids: [], ...row,
  });
  const [filter, setFilter] = useState('');

  const { data: groups = [] } = useQuery({
    queryKey: ['posc', 'ugroups'],
    queryFn: async () => (await apiClient.get('pos/config/user-groups/')).data,
  });
  const { data: articles = [] } = useQuery({
    queryKey: ['posc', 'articles-all'],
    queryFn: async () => {
      const r = await apiClient.get('inventory/pos/articles/');
      return r.data?.results || r.data || [];
    },
  });

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/discounts/', d)
      : apiClient.patch(`pos/config/discounts/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({
        title: 'Desconto gravado',
        message: 'Só os grupos marcados o podem aplicar no POS, e só dentro da validade. O servidor recusa o resto.',
      });
      onClose();
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const gids: number[] = d.group_ids || [];
  const iids: number[] = d.item_ids || [];
  const toggleG = (id: number) => set('group_ids', gids.includes(id) ? gids.filter((x) => x !== id) : [...gids, id]);
  const chosen = (articles as any[]).filter((a) => iids.includes(a.id))
    .filter((a) => !filter || `${a.code} ${a.name}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Novo desconto' : `A editar ${d.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Esquerda: a ficha */}
        <div className="w-[54%] p-4 space-y-2 overflow-auto border-r border-[#e0e0e0]">
          <div className="flex items-center gap-6 text-[12px]">
            <span className="w-[130px] text-[#333]">Módulos:</span>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!d.for_pms} onChange={(e) => set('for_pms', e.target.checked)} className="w-4 h-4" />PMS</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!d.for_ems} onChange={(e) => set('for_ems', e.target.checked)} className="w-4 h-4" />Eventos</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!d.for_pos} onChange={(e) => set('for_pos', e.target.checked)} className="w-4 h-4" />POS</label>
          </div>

          <Row label="Nr:">
            <input type="number" value={d.number ?? 0} onChange={(e) => set('number', Number(e.target.value))}
              className={`${inp} w-[130px]`} style={inputStyle} />
          </Row>
          <Row label="Código:">
            <input value={d.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())}
              className={`${inp} w-[290px]`} style={inputStyle} />
          </Row>
          <Row label="Descrição:">
            <input value={d.name || ''} onChange={(e) => set('name', e.target.value)}
              className={`${inp} flex-1`} style={inputStyle} />
          </Row>
          <Row label="Base:">
            <select value={d.base} onChange={(e) => set('base', e.target.value)} className={`${inp} w-[290px]`} style={inputStyle}>
              <option value="PERCENT">Percentagem</option>
              <option value="VALUE">Valor</option>
            </select>
          </Row>
          <Row label="Válido de:">
            <input type="date" value={(d.valid_from || '').slice(0, 10)}
              onChange={(e) => set('valid_from', e.target.value || null)} className={`${inp} w-[290px]`} style={inputStyle} />
          </Row>
          <Row label="Válido até:">
            <input type="date" value={(d.valid_to || '').slice(0, 10)}
              onChange={(e) => set('valid_to', e.target.value || null)} className={`${inp} w-[290px]`} style={inputStyle} />
          </Row>
          <Row label="Valor:">
            <input type="number" step="any" value={d.value ?? 0} onChange={(e) => set('value', e.target.value)}
              className={`${inp} w-[130px]`} style={inputStyle} />
            <span className="text-[11px] text-[#666]">{d.base === 'PERCENT' ? '%' : 'Kz'}</span>
          </Row>

          <label className="flex items-center gap-2 text-[12px] pt-1">
            <input type="checkbox" checked={!!d.allow_manual} onChange={(e) => set('allow_manual', e.target.checked)} className="w-4 h-4" />
            Permite Desconto Manual
          </label>

          <Row label="Modo Calc.:">
            <select value={d.calc_mode} onChange={(e) => set('calc_mode', e.target.value)} className={`${inp} w-[200px]`} style={inputStyle}>
              <option value="GENERAL">Geral</option>
              <option value="NIGHTS">Por noites</option>
              <option value="FIRST">Primeira noite</option>
            </select>
            <span className="text-[12px] text-[#666] ml-2">Base:</span>
            <select value={d.calc_base || ''} onChange={(e) => set('calc_base', e.target.value)}
              disabled={d.calc_mode === 'GENERAL'}
              className={`${inp} w-[140px] disabled:bg-[#f0f0f0] disabled:text-[#999]`} style={inputStyle}>
              <option value="">Geral</option>
              <option value="ROOM">Alojamento</option>
              <option value="FNB">F&B</option>
            </select>
          </Row>

          <label className={`flex items-center gap-2 text-[12px] pt-1 ${d.calc_mode === 'GENERAL' ? 'opacity-45' : ''}`}>
            <input type="checkbox" checked={!!d.set_nights} disabled={d.calc_mode === 'GENERAL'}
              onChange={(e) => set('set_nights', e.target.checked)} className="w-4 h-4" />
            Definir dias a descontar
          </label>
          <Row label="Dias Estadia:">
            <input type="number" value={d.stay_nights ?? 0} disabled={!d.set_nights}
              onChange={(e) => set('stay_nights', Number(e.target.value))}
              className={`${inp} w-[130px] disabled:bg-[#f0f0f0] disabled:text-[#999]`} style={inputStyle} />
          </Row>
          <Row label="Dias Pagos:">
            <input type="number" value={d.paid_nights ?? 0} disabled={!d.set_nights}
              onChange={(e) => set('paid_nights', Number(e.target.value))}
              className={`${inp} w-[130px] disabled:bg-[#f0f0f0] disabled:text-[#999]`} style={inputStyle} />
          </Row>
          <label className="flex items-center gap-2 text-[12px] pt-1">
            <input type="checkbox" checked={!!d.use_intervals} onChange={(e) => set('use_intervals', e.target.checked)} className="w-4 h-4" />
            Usar intervalos
          </label>
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
            Ativo
          </label>

          {gids.length === 0 && (
            <div className="text-[11px] text-[#8a6100] bg-[#fff7e6] border border-[#e0c080] px-2 py-1 mt-2">
              Sem nenhum grupo marcado, <b>ninguém</b> consegue aplicar este desconto no POS.
            </div>
          )}
        </div>

        {/* Direita: quem o pode dar / a que artigos se aplica */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex border-b-2 border-[#2b2b2b] px-2">
            {([['groups', 'Grupos de Utilizadores'], ['fnb', 'F&B']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-4 py-1.5 text-[12px] font-semibold border-b-[3px] ${tab === k ? 'border-[#2b2b2b] text-[#111] bg-white' : 'border-transparent text-[#666] hover:text-[#111]'}`}>
                {l}
              </button>
            ))}
          </div>

          {tab === 'groups' ? (
            <div className="flex-1 overflow-auto">
              <label className="flex items-center gap-2 px-3 py-2 text-[12px] bg-[#f4f4f4] border-b border-[#d0d0d0]">
                <input type="checkbox"
                  checked={gids.length === (groups as any[]).length && gids.length > 0}
                  onChange={(e) => set('group_ids', e.target.checked ? (groups as any[]).map((g) => g.id) : [])}
                  className="w-4 h-4" />
                Selecionar Tudo
              </label>
              <table className="w-full text-[12px] border-collapse">
                <thead><tr className="bg-[#f0f0f0]">
                  <th className="w-[46px] border-b border-[#d0d0d0]" />
                  <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Grupo de Utilizador</th>
                </tr></thead>
                <tbody>
                  {(groups as any[]).map((g) => (
                    <tr key={g.id} onClick={() => toggleG(g.id)}
                      className={`border-b border-[#eee] cursor-pointer ${gids.includes(g.id) ? 'bg-[#e8f5e9]' : 'hover:bg-[#f5f9ff]'}`}>
                      <td className="text-center py-1.5"><GridCheck checked={gids.includes(g.id)} onChange={() => toggleG(g.id)} /></td>
                      <td className="px-2 py-1.5">{g.name}</td>
                    </tr>
                  ))}
                  {(groups as any[]).length === 0 && (
                    <tr><td colSpan={2} className="text-center text-[#999] py-8">Sem grupos de utilizadores.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2 bg-[#f4f4f4] border-b border-[#d0d0d0]">
                <span className="text-[12px]">Filtro:</span>
                <input value={filter} onChange={(e) => setFilter(e.target.value)} className={`${inp} w-[220px]`} style={inputStyle} />
                <span className="ml-auto text-[11px] text-[#666]">
                  {iids.length === 0 ? 'Sem artigos = aplica-se à conta toda' : `${iids.length} artigo(s)`}
                </span>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-[12px] border-collapse">
                  <thead><tr className="bg-[#f0f0f0]">
                    <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Artigo</th>
                    <th className="w-[70px] border-b border-[#d0d0d0]" />
                  </tr></thead>
                  <tbody>
                    {chosen.map((a: any) => (
                      <tr key={a.id} className="border-b border-[#eee]">
                        <td className="px-2 py-1.5"><b className="font-mono">{a.code}</b> · {a.name}</td>
                        <td className="text-center">
                          <button onClick={() => set('item_ids', iids.filter((x) => x !== a.id))}
                            className="text-red-600 font-bold text-[11px]">Apagar</button>
                        </td>
                      </tr>
                    ))}
                    {chosen.length === 0 && (
                      <tr><td colSpan={2} className="text-center text-[#999] py-8">
                        Sem artigos — o desconto aplica-se à conta toda.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-4 px-3 py-2 bg-[#f4f4f4] border-t border-[#d0d0d0]">
                <button onClick={() => setPicker(true)} className="flex items-center gap-2 text-[12px] hover:bg-[#e8e8e8] px-1 py-1">
                  <span className="w-5 h-5 rounded-full bg-[#2b2b2b] text-white flex items-center justify-center text-[11px]">＋</span> Adicionar
                </button>
                <button onClick={() => set('item_ids', [])} disabled={iids.length === 0}
                  className="flex items-center gap-2 text-[12px] hover:bg-[#e8e8e8] px-1 py-1 disabled:opacity-35">
                  <span className="w-5 h-5 rounded-full bg-[#c0392b] text-white flex items-center justify-center text-[11px]">−</span> Apagar tudo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {picker && (
        <ItemPicker exclude={iids} title="Adicionar - Artigos"
          onPick={(rows) => { set('item_ids', [...iids, ...rows.map((r) => r.id)]); setPicker(false); }}
          onClose={() => setPicker(false)} />
      )}

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
