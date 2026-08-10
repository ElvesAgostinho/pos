import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, money, Glyph, SearchButton } from './kit';
import EntityEditor from './EntityEditor';

const inp = 'border border-[#8a95a3] px-2 py-[3px] text-[12px] bg-white';
const lbl = 'text-[12px] text-[#333] w-[120px] flex-shrink-0';

/** Lista simples de um endpoint (as tabelas que o POS já tem). */
function useList(ep: string, key: string) {
  return useQuery({
    queryKey: ['posmkt', key],
    queryFn: async () => {
      const r = await apiClient.get(ep);
      return (r.data?.results || r.data || []) as any[];
    },
  });
}

/** Cabeçalho de painel cinzento, como no original. */
const Painel = ({ title, children, right }: any) => (
  <div className="bg-white" style={{ border: '4px groove #c0c0c0' }}>
    <div className="flex items-center justify-between px-3 py-1.5 bg-[#e4e4e4] border-b border-[#c8c8c8]">
      <span className="text-[12px] font-bold text-[#333]">{title}</span>
      {right}
    </div>
    {children}
  </div>
);

// ═══════════════════════════════════════════════ PESQUISA DE ENTIDADES
export function EntitySearch() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'S' | 'A'>('S');
  const [f, setF] = useState<any>({});
  const [aplicado, setAplicado] = useState<any>({});
  const [sel, setSel] = useState<number | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [obrig, setObrig] = useState(false);
  const [dups, setDups] = useState(false);

  const { data: tipos = [] } = useList('pos/config/customer-types/', 'ctypes');
  const { data: cartoes = [] } = useList('pos/config/member-cards/', 'cards');
  const { data: regras = [] } = useList('pos/marketing/entity-rules/', 'rules');

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ['posmkt', 'entities', aplicado],
    queryFn: async () => {
      const params: any = {};
      Object.entries(aplicado).forEach(([k, v]) => { if (v) params[k] = v; });
      const r = await apiClient.get('pos/marketing/entities/', { params });
      return (r.data?.results || r.data || []) as any[];
    },
  });

  const inval = () => qc.invalidateQueries({ queryKey: ['posmkt'] });
  const gravar = useMutation({
    mutationFn: (v: any) => v.id ? apiClient.patch(`pos/marketing/entities/${v.id}/`, v)
      : apiClient.post('pos/marketing/entities/', v),
    onSuccess: () => { setEdit(null); inval(); notifyGuide({ title: 'Entidade gravada', message: 'É a mesma ficha que a faturação usa.' }); },
    onError: notifyError,
  });
  const regra = useMutation({
    mutationFn: ({ id, v }: any) => apiClient.patch(`pos/marketing/entity-rules/${id}/`, { is_required: v }),
    onSuccess: inval, onError: notifyError,
  });
  const { data: duplicados } = useQuery({
    queryKey: ['posmkt', 'dups'],
    queryFn: async () => (await apiClient.get('pos/marketing/entities/duplicates/')).data,
    enabled: dups,
  });

  const total = rows.length;
  const paginas = Math.max(1, Math.ceil(total / pageSize));
  const vista = rows.slice((page - 1) * pageSize, page * pageSize);
  const pesquisar = () => { setAplicado({ ...f }); setPage(1); };

  // ---------- ficha (Adicionar/Editar) — o editor COMPLETO do HOST, em janela ----------
  if (edit) {
    return (
      <EntityEditor entity={edit}
        onClose={() => setEdit(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['mkt'] })} />
    );
  }
  // (ficha antiga inline mantida abaixo apenas como referência morta — nunca alcançada)
  if (false && edit) {
    const F = ({ k, label, type = 'text' }: any) => (
      <div className="flex items-center gap-2">
        <span className={lbl}>{label}</span>
        <input type={type} value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
          className={`${inp} w-[230px]`} style={inputStyle} />
      </div>
    );
    const req = new Set(regras.filter((r: any) => r.is_required).map((r: any) => r.field));
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[#f0f0f0]">
        <div className="flex-1 overflow-auto p-3">
          <Painel title={edit.id ? `Ficha de entidade — ${edit.name}` : 'Nova entidade'}>
            <div className="grid grid-cols-3 gap-x-8 gap-y-2 p-4">
              <F k="code" label="Nr. cliente:" />
              <F k="name" label="Nome:" />
              <F k="last_name" label="Apelido:" />
              <F k="other_names" label="Outros nomes:" />
              <div className="flex items-center gap-2">
                <span className={lbl}>Tipo de entidade:</span>
                <select value={edit.entity_type ?? ''} onChange={(e) => setEdit({ ...edit, entity_type: e.target.value || null })}
                  className={`${inp} w-[230px]`} style={inputStyle}>
                  <option value="">(Nenhum)</option>
                  {tipos.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <F k="tax_id" label="Nr. contrib.:" />
              <F k="id_number" label="Nr. de identif.:" />
              <F k="nationality" label="Nacionalidade:" />
              <F k="country" label="País:" />
              <F k="birth_date" label="Data de nasc.:" type="date" />
              <F k="email" label="E-mail:" />
              <F k="phone" label="Telefone:" />
              <div className="col-span-2 flex items-center gap-2">
                <span className={lbl}>Morada:</span>
                <input value={edit.address ?? ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })}
                  className={`${inp} w-[600px]`} style={inputStyle} />
              </div>
              <div className="flex items-center gap-2">
                <span className={lbl}>Cartão membro:</span>
                <select value={edit.member_card ?? ''} onChange={(e) => setEdit({ ...edit, member_card: e.target.value || null })}
                  className={`${inp} w-[230px]`} style={inputStyle}>
                  <option value="">(Nenhum)</option>
                  {cartoes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <F k="member_card_number" label="Nº do cartão:" />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                  <input type="checkbox" checked={!!edit.is_blocked}
                    onChange={(e) => setEdit({ ...edit, is_blocked: e.target.checked })} className="w-4 h-4" />
                  Bloqueado
                </label>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <span className={lbl}>Motivo bloqueio:</span>
                <input value={edit.block_reason ?? ''} onChange={(e) => setEdit({ ...edit, block_reason: e.target.value })}
                  disabled={!edit.is_blocked}
                  className={`${inp} w-[600px] disabled:bg-[#f0f0f0]`} style={inputStyle} />
              </div>
              <div className="col-span-3 flex items-start gap-2">
                <span className={lbl}>Informações:</span>
                <textarea value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                  rows={3} className={`${inp} w-[600px]`} style={inputStyle} />
              </div>
            </div>
            {req.size > 0 && (
              <div className="px-4 pb-3 text-[11px] text-[#8a6100]">
                Obrigatórios nesta casa: {regras.filter((r: any) => r.is_required).map((r: any) => r.label).join(', ')}.
              </div>
            )}
          </Painel>
        </div>
        <Toolbar actions={[
          { label: 'Gravar', icon: '✔', color: '#1f7a34', onClick: () => gravar.mutate(edit) },
          { label: 'Fechar', icon: '✖', color: '#6b6b6b', onClick: () => setEdit(null) },
        ]} />
      </div>
    );
  }

  // ---------- pesquisa ----------
  const Campo = ({ k, label, w = 'w-[190px]' }: any) => (
    <div className="flex items-center gap-2">
      <span className={lbl}>{label}</span>
      <input value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && pesquisar()}
        className={`${inp} ${w}`} style={inputStyle} />
    </div>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#f0f0f0]">
      <div className="p-3 pb-0">
        <Painel title="Critérios Pesquisa">
          <div className="flex gap-0 px-3 pt-2">
            {[['S', 'Pesquisa simples'], ['A', 'Pesquisa Avançada']].map(([k, t]) => (
              <button key={k} onClick={() => setTab(k as any)}
                className={`px-4 py-1.5 text-[12px] border-b-2 ${tab === k
                  ? 'border-[#3d6ea5] font-bold text-[#1a4f8a] bg-white'
                  : 'border-transparent text-[#666] hover:bg-[#f5f5f5]'}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-4 p-4 border-t border-[#e0e0e0]">
            <div className="flex-1">
              {tab === 'S' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={lbl}>Tipo de entidade:</span>
                    <select value={f.entity_type ?? ''} onChange={(e) => setF({ ...f, entity_type: e.target.value })}
                      className={`${inp} w-[280px]`} style={inputStyle}>
                      <option value="">(Todos)</option>
                      {tipos.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={lbl}>Pesquisa livre:</span>
                    <input value={f.q ?? ''} onChange={(e) => setF({ ...f, q: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && pesquisar()}
                      className={`${inp} w-[280px]`} style={inputStyle} autoFocus />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-x-8 gap-y-2">
                  <div className="flex items-center gap-2">
                    <span className={lbl}>Tipo de entidade:</span>
                    <select value={f.entity_type ?? ''} onChange={(e) => setF({ ...f, entity_type: e.target.value })}
                      className={`${inp} w-[190px]`} style={inputStyle}>
                      <option value="">(Todos)</option>
                      {tipos.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <Campo k="code" label="Nr. cliente:" />
                  <Campo k="tax_id" label="Nr. contrib.:" />
                  <Campo k="last_name" label="Apelido:" />
                  <Campo k="name" label="Nome:" />
                  <Campo k="id_number" label="Nr. de identif.:" />
                  <Campo k="other_names" label="Outros nomes:" />
                  <Campo k="contact" label="E-mail/Telefone:" />
                  <Campo k="nationality" label="Nacionalidade:" />
                  <Campo k="country" label="País:" />
                  <Campo k="address" label="Morada:" />
                  <div className="flex items-center gap-2">
                    <span className={lbl}>Cartão Mem.:</span>
                    <select value={f.member_card ?? ''} onChange={(e) => setF({ ...f, member_card: e.target.value })}
                      className={`${inp} w-[110px]`} style={inputStyle}>
                      <option value="">(Todos)</option>
                      {cartoes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input value={f.card_number ?? ''} onChange={(e) => setF({ ...f, card_number: e.target.value })}
                      className={`${inp} w-[75px]`} style={inputStyle} placeholder="nº" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={lbl}>Bloqueios:</span>
                    <select value={f.blocked ?? ''} onChange={(e) => setF({ ...f, blocked: e.target.value })}
                      className={`${inp} w-[190px]`} style={inputStyle}>
                      <option value="">(Todos)</option>
                      <option value="1">Só bloqueados</option>
                      <option value="0">Sem bloqueio</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
            <SearchButton onClick={pesquisar} className="w-[200px]" />
          </div>
        </Painel>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden p-3">
        <Painel title="Resultado da pesquisa">
          <div className="overflow-auto" style={{ maxHeight: '46vh' }}>
            <table className="w-full text-[12px] border-collapse">
              <thead className="sticky top-0"><tr className="bg-[#f0f0f0]">
                {['Apelido', 'Nome', 'Outros nomes', 'Nr. cliente', 'Tipo', 'Morada', 'Contacto',
                  'Cartão', 'Informações'].map((h) => (
                  <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0] border-r border-r-[#e6e6e6]">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {vista.map((r) => (
                  <tr key={r.id} onClick={() => setSel(r.id)} onDoubleClick={() => setEdit({ ...r })}
                    className={`border-b border-[#eee] cursor-pointer ${sel === r.id ? 'bg-[#dce9f7]' : 'hover:bg-[#f5f9ff]'}`}>
                    <td className="px-2 py-1">{r.last_name || '—'}</td>
                    <td className="px-2 py-1 font-semibold">
                      {r.is_blocked && <span title={r.block_reason || 'Bloqueado'} className="text-[#a01818] mr-1 inline-flex align-middle"><Glyph icon="⛔" size={13} /></span>}
                      {r.name}
                    </td>
                    <td className="px-2 py-1">{r.other_names || '—'}</td>
                    <td className="px-2 py-1 font-mono text-[#666]">{r.code}</td>
                    <td className="px-2 py-1">{r.entity_type_name || '—'}</td>
                    <td className="px-2 py-1">{r.address || '—'}</td>
                    <td className="px-2 py-1">{r.contact || '—'}</td>
                    <td className="px-2 py-1">{r.card_name ? `${r.card_name}${r.member_card_number ? ' · ' + r.member_card_number : ''}` : '—'}</td>
                    <td className="px-2 py-1 text-[#666]">
                      {r.documents ? `${r.documents} doc · ${money(r.spent)} Kz` : ''}
                      {r.events ? ` · ${r.events} evento(s)` : ''}
                    </td>
                  </tr>
                ))}
                {vista.length === 0 && (
                  <tr><td colSpan={9} className="text-center text-[#999] py-10">
                    {isFetching ? 'A pesquisar…' : 'Não foram encontrados dados.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f4f4f4] border-t border-[#d8d8d8] text-[12px]">
            <span>Nº registos a visualizar:</span>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className={`${inp} w-[70px]`} style={inputStyle}>
              {[25, 50, 100, 200].map((n) => <option key={n}>{n}</option>)}
            </select>
            <button disabled={page <= 1} onClick={() => setPage(1)} className="px-2 disabled:opacity-30">⏮</button>
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-2 disabled:opacity-30">◀</button>
            <span>Página</span>
            <input value={page} onChange={(e) => setPage(Math.min(paginas, Math.max(1, Number(e.target.value) || 1)))}
              className={`${inp} w-[46px] text-center`} style={inputStyle} />
            <span>de {paginas}</span>
            <button disabled={page >= paginas} onClick={() => setPage(page + 1)} className="px-2 disabled:opacity-30">▶</button>
            <button disabled={page >= paginas} onClick={() => setPage(paginas)} className="px-2 disabled:opacity-30">⏭</button>
            <span className="ml-auto text-[#666]">
              {total === 0 ? 'Não foram encontrados dados.' : `${total} entidade(s)`}
            </span>
          </div>
        </Painel>
      </div>

      {/* Campos obrigatórios — cada caixa é exigida pelo servidor ao gravar */}
      {obrig && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[70]" onClick={() => setObrig(false)} />
          <div className="fixed left-1/2 top-1/4 -translate-x-1/2 z-[71] bg-white border border-[#888] shadow-2xl w-[440px]">
            <div className="px-3 py-2 bg-[#3c3c3c] text-white text-[13px] font-bold flex justify-between">
              Campos obrigatórios <button onClick={() => setObrig(false)} className="inline-flex"><Glyph icon="✕" size={13} /></button>
            </div>
            <div className="p-3 max-h-[50vh] overflow-auto">
              <div className="text-[11px] text-[#666] mb-2">
                O servidor recusa gravar uma entidade sem estes campos. Não é um aviso — é uma regra.
              </div>
              {regras.map((r: any) => (
                <label key={r.id} className="flex items-center gap-2 py-1 text-[12px] cursor-pointer">
                  <input type="checkbox" checked={!!r.is_required}
                    onChange={(e) => regra.mutate({ id: r.id, v: e.target.checked })}
                    disabled={r.field === 'name'} className="w-4 h-4" />
                  {r.label}{r.field === 'name' && <span className="text-[#999] text-[11px]">(sempre)</span>}
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Controlo de duplicação */}
      {dups && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[70]" onClick={() => setDups(false)} />
          <div className="fixed left-1/2 top-1/5 -translate-x-1/2 z-[71] bg-white border border-[#888] shadow-2xl w-[620px]">
            <div className="px-3 py-2 bg-[#3c3c3c] text-white text-[13px] font-bold flex justify-between">
              Controlo de duplicação <button onClick={() => setDups(false)} className="inline-flex"><Glyph icon="✕" size={13} /></button>
            </div>
            <div className="p-3 max-h-[55vh] overflow-auto text-[12px]">
              {(duplicados?.groups || []).length === 0 ? (
                <div className="text-center text-[#1f7a34] py-8 font-bold flex items-center justify-center gap-1.5">
                  <Glyph icon="✔" size={15} /> Nenhuma entidade repetida.
                </div>
              ) : (duplicados.groups.map((g: any, i: number) => (
                <div key={i} className="mb-3 border border-[#e6b0aa] bg-[#fdecea] p-2">
                  <div className="font-bold text-[#a01818]">{g.field}: {g.value}</div>
                  {g.entities.map((e: any) => (
                    <div key={e.id} className="pl-3">· [{e.code}] {e.name}</div>
                  ))}
                </div>
              )))}
            </div>
          </div>
        </>
      )}

      <Toolbar actions={[
        { label: 'Adicionar', icon: '➕', onClick: () => setEdit({ is_blocked: false }) },
        { label: 'Editar', icon: '✏', disabled: !sel, onClick: () => setEdit({ ...rows.find((r) => r.id === sel) }) },
        { label: 'Campos obrigatórios', icon: '☑', color: '#1a73c8', onClick: () => setObrig(true) },
        { label: 'Controlo de duplicação', icon: '⧉', color: '#5d4037', onClick: () => setDups(true) },
      ]} />
    </div>
  );
}

// ═══════════════════════════════════════════════ PEDIDOS DE EVENTOS
export function EventRequests() {
  const qc = useQueryClient();
  const [estado, setEstado] = useState('0');       // por omissão: Não Respondido
  const [sel, setSel] = useState<number | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const { data: tipos = [] } = useList('pos/config/event-types/', 'ev-types');
  const { data: espacos = [] } = useList('pos/config/sectors/', 'sectors');
  const { data: estados = [] } = useList('pos/config/event-states/', 'ev-states');
  const { data: layouts = [] } = useList('pos/config/space-layouts/', 'layouts');
  const { data: segmentos = [] } = useList('pos/config/segments/', 'segments');
  const { data: canais = [] } = useList('pos/config/channels/', 'channels');
  const { data: packages = [] } = useList('pos/config/packages/', 'packages');
  const { data: motivos = [] } = useList('pos/config/cancel-reasons/', 'reasons');
  const { data: entidades = [] } = useList('pos/marketing/entities/', 'ents');

  const { data: rows = [] } = useQuery({
    queryKey: ['posmkt', 'events', estado],
    queryFn: async () => {
      const r = await apiClient.get('pos/events/requests/',
        { params: estado === '' ? {} : { answered: estado } });
      return (r.data?.results || r.data || []) as any[];
    },
    refetchInterval: 20000,
  });

  const inval = () => qc.invalidateQueries({ queryKey: ['posmkt'] });
  const gravar = useMutation({
    mutationFn: (v: any) => v.id ? apiClient.patch(`pos/events/requests/${v.id}/`, v)
      : apiClient.post('pos/events/requests/', v),
    onSuccess: () => { setEdit(null); inval(); notifyGuide({ title: 'Pedido gravado', message: 'O espaço fica reservado conforme o estado escolhido.' }); },
    onError: notifyError,
  });
  const cancelar = useMutation({
    mutationFn: ({ id, cancel_reason }: any) => apiClient.post(`pos/events/requests/${id}/cancel/`, { cancel_reason }),
    onSuccess: () => { setEdit(null); inval(); notifyGuide({ title: 'Evento cancelado', message: 'O espaço voltou a ficar livre.' }); },
    onError: notifyError,
  });

  const total = rows.length;
  const paginas = Math.max(1, Math.ceil(total / pageSize));
  const vista = rows.slice((page - 1) * pageSize, page * pageSize);
  const dt = (v: string) => v ? new Date(v).toLocaleString('pt-PT',
    { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  const exportar = () => {
    const head = ['Data do pedido', 'Nome', 'Telefone', 'E-mail', 'Data', 'Pax', 'Tipo de Evento', 'Notas', 'Estado'];
    const csv = [head.join(';'), ...rows.map((r) => [
      dt(r.created_at), r.customer_name || r.contact_name || '', r.phone || '', r.email || '',
      dt(r.start_at), r.pax, r.event_type_name || '', (r.notes || '').replace(/[\r\n;]/g, ' '),
      r.answered ? 'Respondido' : 'Não Respondido'].join(';'))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'pedidos_eventos.csv'; a.click();
  };

  if (edit) {
    const Sel = ({ k, label, list }: any) => (
      <div className="flex items-center gap-2">
        <span className={lbl}>{label}</span>
        <select value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value || null })}
          className={`${inp} w-[230px]`} style={inputStyle}>
          <option value="">(Nenhum)</option>
          {list.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
    );
    const F = ({ k, label, type = 'text', w = 'w-[230px]' }: any) => (
      <div className="flex items-center gap-2">
        <span className={lbl}>{label}</span>
        <input type={type} value={type === 'datetime-local' ? (edit[k] || '').slice(0, 16) : (edit[k] ?? '')}
          onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
          className={`${inp} ${w}`} style={inputStyle} />
      </div>
    );
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[#f0f0f0]">
        <div className="flex-1 overflow-auto p-3">
          <Painel title={edit.id ? `Pedido ${edit.number} — ${edit.title}` : 'Novo pedido de evento'}>
            <div className="grid grid-cols-3 gap-x-8 gap-y-2 p-4">
              <F k="title" label="Designação:" />
              <Sel k="customer" label="Entidade:" list={entidades} />
              <F k="contact_name" label="Nome do contacto:" />
              <F k="phone" label="Telefone:" />
              <F k="email" label="E-mail:" />
              <Sel k="event_type" label="Tipo de Evento:" list={tipos} />
              <F k="start_at" label="Data (início):" type="datetime-local" />
              <F k="end_at" label="Data (fim):" type="datetime-local" />
              <F k="pax" label="Pax:" type="number" w="w-[100px]" />
              <Sel k="space" label="Espaço:" list={espacos} />
              <Sel k="layout" label="Disposição:" list={layouts} />
              <Sel k="state" label="Estado da reserva:" list={estados} />
              <Sel k="segment" label="Segmento:" list={segmentos} />
              <Sel k="channel" label="Canal:" list={canais} />
              <Sel k="package" label="Package:" list={packages} />
              <F k="price_per_pax" label="Preço/pax:" type="number" w="w-[140px]" />
              <F k="extra_total" label="Extras:" type="number" w="w-[140px]" />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                  <input type="checkbox" checked={!!edit.answered}
                    onChange={(e) => setEdit({ ...edit, answered: e.target.checked })} className="w-4 h-4" />
                  Respondido
                </label>
              </div>
              <div className="col-span-3 flex items-start gap-2">
                <span className={lbl}>Notas:</span>
                <textarea value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                  rows={3} className={`${inp} w-[620px]`} style={inputStyle} />
              </div>
            </div>
            <div className="px-4 pb-3 text-[11px] text-[#8a6100]">
              O <b>Estado da reserva</b> decide se o espaço fica bloqueado: um Confirmado tira a sala do
              mercado e o sistema recusa outro à mesma hora; uma Opção não bloqueia.
              Marcar <b>Respondido</b> tira o pedido da lista de trabalho do comercial.
            </div>
          </Painel>
        </div>
        <Toolbar actions={[
          { label: 'Gravar', icon: '✔', color: '#1f7a34', onClick: () => gravar.mutate(edit) },
          {
            label: 'Cancelar evento', icon: '🚫', disabled: !edit.id,
            onClick: () => {
              const m = prompt('Motivo do cancelamento:\n' +
                motivos.map((x: any, i: number) => `${i + 1}) ${x.name}`).join('\n'));
              const mm = motivos[Number(m) - 1];
              if (mm) cancelar.mutate({ id: edit.id, cancel_reason: mm.id });
            },
          },
          { label: 'Fechar', icon: '✖', color: '#6b6b6b', onClick: () => setEdit(null) },
        ]} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[#d8d8d8] bg-[#f7f7f7] text-[12px]">
        <button onClick={exportar} className="flex items-center gap-2 px-2 py-1 hover:bg-[#e8e8e8]">
          <span className="text-[#1f7a34]"><Glyph icon="📊" size={15} /></span> Exportar para Excel
        </button>
        <span className="ml-2">Estado:</span>
        <select value={estado} onChange={(e) => { setEstado(e.target.value); setPage(1); }}
          className={`${inp} w-[220px]`} style={inputStyle}>
          <option value="">Todos</option>
          <option value="0">Não Respondido</option>
          <option value="1">Respondido</option>
        </select>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0"><tr className="bg-[#f0f0f0]">
            {['Data do pedido', 'Nome', 'Espaço', 'Telefone', 'E-mail', 'Data', 'Pax',
              'Tipo de Evento', 'Notas', 'Estado'].map((h) => (
              <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0] border-r border-r-[#e6e6e6]">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {vista.map((r) => (
              <tr key={r.id} onClick={() => setSel(r.id)} onDoubleClick={() => setEdit({ ...r })}
                className={`border-b border-[#eee] cursor-pointer ${sel === r.id ? 'bg-[#dce9f7]' : 'hover:bg-[#f5f9ff]'}`}>
                <td className="px-2 py-1">{dt(r.created_at)}</td>
                <td className="px-2 py-1 font-semibold">{r.customer_name || r.contact_name || r.title}</td>
                <td className="px-2 py-1">
                  <span className="px-1.5 py-0.5" style={{ background: r.state_bg || '#eee', color: r.state_fg || '#333' }}>
                    {r.space_name}{r.blocks_space && <Glyph icon="🔒" size={11} />}
                  </span>
                </td>
                <td className="px-2 py-1">{r.phone || '—'}</td>
                <td className="px-2 py-1">{r.email || '—'}</td>
                <td className="px-2 py-1">{dt(r.start_at)}</td>
                <td className="px-2 py-1 text-right">{r.pax}</td>
                <td className="px-2 py-1">{r.event_type_name || '—'}</td>
                <td className="px-2 py-1 text-[#666] max-w-[220px] truncate">{r.notes || ''}</td>
                <td className="px-2 py-1">
                  <span className={`px-2 py-0.5 text-[11px] font-semibold ${r.answered
                    ? 'bg-[#e8f5e9] text-[#1f7a34]' : 'bg-[#fff7e6] text-[#8a6100]'}`}>
                    {r.answered ? 'Respondido' : 'Não Respondido'}
                  </span>
                </td>
              </tr>
            ))}
            {vista.length === 0 && (
              <tr><td colSpan={10} className="text-center text-[#999] py-10">Não foram encontrados dados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f4f4f4] border-t border-[#d8d8d8] text-[12px]">
        <span>Nº registos a visualizar:</span>
        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          className={`${inp} w-[70px]`} style={inputStyle}>
          {[25, 50, 100].map((n) => <option key={n}>{n}</option>)}
        </select>
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-2 disabled:opacity-30 inline-flex"><Glyph icon="◀" size={13} /></button>
        <span>Página {page} de {paginas}</span>
        <button disabled={page >= paginas} onClick={() => setPage(page + 1)} className="px-2 disabled:opacity-30 inline-flex"><Glyph icon="▶" size={13} /></button>
        <span className="ml-auto text-[#666]">
          {total === 0 ? 'Não foram encontrados dados.' : `${total} pedido(s)`}
        </span>
      </div>

      <Toolbar actions={[
        { label: 'Adicionar', icon: '➕', onClick: () => setEdit({ pax: 0, price_per_pax: 0, extra_total: 0, answered: false }) },
        { label: 'Editar', icon: '✏', disabled: !sel, onClick: () => setEdit({ ...rows.find((r) => r.id === sel) }) },
      ]} right={
        <span className="text-[11px] text-[#666] flex items-center gap-1">Duplo-clique abre o pedido. <Glyph icon="🔒" size={11} /> = o estado bloqueia o espaço.</span>
      } />
    </div>
  );
}
