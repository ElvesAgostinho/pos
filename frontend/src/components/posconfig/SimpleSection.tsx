import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputCls, inputStyle } from './kit';

export interface Col {
  key: string; label: string; width?: string; render?: (r: any) => any;
  /** Caixa que LIGA/DESLIGA de verdade: clicar grava logo no servidor. */
  toggle?: boolean;
  /** Caixa so de leitura (o valor nao e do cliente - ex.: "Licenciado"). */
  readOnlyCheck?: boolean;
}
export interface FormField {
  key: string; label: string; type?: 'text' | 'number' | 'select' | 'checkbox' | 'textarea';
  options?: { value: any; label: string }[]; width?: string; required?: boolean; help?: string;
}

/**
 * SECÇÃO SIMPLES da Configuração POS (Grupos, Famílias, Sub-Famílias, Mensagens…).
 *
 * É sempre o mesmo desenho: pesquisa em cima, grelha ao centro, paginação, barra de
 * ferramentas em baixo. Ao carregar em Adicionar/Editar, a grelha dá lugar à ÁREA DE
 * EDIÇÃO no mesmo sítio (não abre uma janela por cima) — como nos ERP clássicos.
 */
export default function SimpleSection({ title, endpoint, columns, fields, queryKey, extraParams, renderEditor, copyable, readOnly, banner }: {
  title: string;
  endpoint: string;
  columns: Col[];
  fields: FormField[];
  queryKey: string;
  extraParams?: Record<string, any>;
  /** Mostra "Copiar" (duplica o registo no servidor) — só onde faz sentido. */
  copyable?: boolean;
  /** Só de leitura: vê-se tudo, mas não se cria/edita/apaga (nem as caixas gravam). */
  readOnly?: boolean;
  /** Barra por cima da grelha (ex.: o cadeado das Isenções). */
  banner?: any;
  /** Editor próprio (quando a ficha é mais do que 3 campos — ex.: Sub-Famílias). */
  renderEditor?: (row: any, close: () => void) => any;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const [editing, setEditing] = useState<any | null>(null);   // null = grelha; objeto = área de edição
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: rows = [] } = useQuery({
    queryKey: ['posc', queryKey, extraParams],
    queryFn: async () => {
      const r = await apiClient.get(endpoint, { params: extraParams });
      return r.data?.results || r.data || [];
    },
  });

  const inval = () => qc.invalidateQueries({ queryKey: ['posc'] });
  const save = useMutation({
    mutationFn: (v: any) => v.id ? apiClient.patch(`${endpoint}${v.id}/`, v) : apiClient.post(endpoint, v),
    onSuccess: () => { inval(); setEditing(null); notifyGuide({ title: `${title} gravado`, message: 'As alterações entraram já no sistema.' }); },
    onError: notifyError,
  });
  const copy = useMutation({
    mutationFn: (id: number) => apiClient.post(`${endpoint}${id}/duplicate/`),
    onSuccess: (r: any) => { qc.invalidateQueries({ queryKey: ['posc'] }); setEditing(r.data); },
    onError: notifyError,
  });
  const del = useMutation({
    mutationFn: (id: number) => apiClient.delete(`${endpoint}${id}/`),
    onSuccess: () => { inval(); setSel(null); },
    onError: notifyError,
  });
  // As caixas da grelha nao sao enfeite: clicar liga/desliga a funcao e grava ja.
  const toggle = useMutation({
    mutationFn: ({ id, key, value }: any) => apiClient.patch(`${endpoint}${id}/`, { [key]: value }),
    onSuccess: inval, onError: notifyError,
  });

  const filtered = rows.filter((r: any) =>
    !q || Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q.toLowerCase())));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const view = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selRow = rows.find((r: any) => r.id === sel);

  const exportCsv = () => {
    const csv = [columns.map((c) => c.label).join(';'),
      ...filtered.map((r: any) => columns.map((c) => String(r[c.key] ?? '')).join(';'))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${queryKey}.csv`; a.click();
  };

  // ---------- ÁREA DE EDIÇÃO ----------
  if (editing && renderEditor) return renderEditor(editing, () => setEditing(null));
  if (editing) {
    const set = (k: string, v: any) => setEditing((o: any) => ({ ...o, [k]: v }));
    const missing = fields.filter((f) => f.required && !editing[f.key]);
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
          <span className="text-[13px] font-bold text-[#333]">
            {editing.id ? `A editar ${editing.name || ''}` : `Novo ${title.toLowerCase()}`}
          </span>
          <button onClick={() => setEditing(null)} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="space-y-2 max-w-[820px]">
            {fields.map((f) => (
              <label key={f.key} className={`flex gap-3 text-[13px] ${f.type === 'textarea' ? 'items-start' : 'items-center'}`}>
                <span className={`w-[160px] flex-shrink-0 text-[#333] ${f.type === 'textarea' ? 'pt-1' : ''}`}>
                  {f.label}{f.required && <span className="text-[#a01818]">*</span>}
                </span>
                {f.type === 'textarea' ? (
                  <textarea value={editing[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} rows={5}
                    className={`${inputCls} ${f.width || 'w-[300px]'} flex-none`} style={inputStyle} />
                ) : f.type === 'select' ? (
                  <select value={editing[f.key] ?? ''} onChange={(e) => set(f.key, Number(e.target.value) || e.target.value || null)}
                    className={`${inputCls} ${f.width || 'w-[300px]'} flex-none`} style={inputStyle}>
                    <option value="">—</option>
                    {(f.options || []).map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === 'checkbox' ? (
                  <input type="checkbox" checked={!!editing[f.key]} onChange={(e) => set(f.key, e.target.checked)} className="w-4 h-4" />
                ) : (
                  <input type={f.type || 'text'} value={editing[f.key] ?? ''}
                    onChange={(e) => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                    className={`${inputCls} ${f.width || 'w-[300px]'} flex-none`} style={inputStyle} />
                )}
                {f.help && <span className="text-[11px] text-[#888]">{f.help}</span>}
              </label>
            ))}
          </div>
        </div>

        <Toolbar actions={[
          {
            icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34',
            onClick: () => missing.length
              ? notifyGuide({ title: 'Faltam campos', message: `Preencha: ${missing.map((m) => m.label).join(', ')}.` })
              : save.mutate(editing),
          },
          { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: () => setEditing(null) },
        ]} />
      </div>
    );
  }

  // ---------- GRELHA ----------
  const novo: any = {};
  fields.forEach((f) => { novo[f.key] = f.type === 'checkbox' ? true : ''; });

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[#d0d0d0] bg-[#f7f7f7] text-[13px]">
        <span className="text-[#333]">Pesquisar:</span>
        <div className="flex items-center border border-[#8a95a3] bg-white" style={inputStyle}>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
            className="px-2 py-1 text-[12px] outline-none w-[220px]" />
          <span className="px-2 text-[#666]">🔍</span>
        </div>
      </div>

      {banner}

      <div className="flex-1 overflow-auto">
        <table className="w-full text-[13px] border-collapse">
          <thead className="sticky top-0">
            <tr style={{ background: '#efefef' }} className="text-[#333]">
              {columns.map((c) => (
                <th key={c.key} className="text-left font-normal px-3 py-2 border-b border-[#d0d0d0]"
                  style={{ width: c.width }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r: any) => (
              <tr key={r.id} onClick={() => setSel(r.id)} onDoubleClick={() => !readOnly && setEditing({ ...r })}
                className={`cursor-pointer border-b border-[#f0f0f0] ${sel === r.id ? 'bg-[#cfe2f3]' : 'hover:bg-[#f5f9ff]'}`}>
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-1.5">
                    {c.toggle ? (
                      <input type="checkbox" checked={!!r[c.key]} disabled={readOnly}
                        className="w-4 h-4 cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => toggle.mutate({ id: r.id, key: c.key, value: e.target.checked })} />
                    ) : c.readOnlyCheck ? (
                      <span title="Vem da licenca assinada - nao e editavel.">
                        {r[c.key] ? <span className="text-green-600 font-bold">OK</span> : <span className="text-[#bbb]">-</span>}
                      </span>
                    ) : c.render ? c.render(r) : (r[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
            {view.length === 0 && (
              <tr><td colSpan={columns.length} className="text-center text-[#999] py-10">Sem registos.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-[#c0c0c0] bg-[#f4f4f4] text-[12px]">
        <span>Nº registos a visualizar:</span>
        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          className="border border-[#8a95a3] px-2 py-0.5 bg-white">
          {[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(1)} disabled={page === 1} className="px-1.5 disabled:opacity-30">⏮</button>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-1.5 disabled:opacity-30">◀</button>
          <span>Página</span>
          <input value={page} onChange={(e) => setPage(Math.min(totalPages, Math.max(1, Number(e.target.value) || 1)))}
            className="w-12 border border-[#8a95a3] px-1 py-0.5 text-center bg-white" />
          <span>de {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-1.5 disabled:opacity-30">▶</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-1.5 disabled:opacity-30">⏭</button>
        </div>
        <span className="ml-auto text-[#555]">
          Nº registos a visualizar {filtered.length ? (page - 1) * pageSize + 1 : 0} - {Math.min(page * pageSize, filtered.length)} de {filtered.length}
        </span>
      </div>

      <Toolbar actions={[
        { icon: '＋', label: 'Adicionar', color: '#2b2b2b', disabled: readOnly, onClick: () => setEditing({ ...novo, ...extraParams }) },
        { icon: '✎', label: 'Editar', color: '#1a73c8', disabled: !sel || readOnly, onClick: () => setEditing({ ...selRow }) },
        ...(copyable ? [{ icon: '⧉', label: 'Copiar', color: '#5d4037', disabled: !sel || readOnly, onClick: () => copy.mutate(sel!) }] : []),
        { icon: '−', label: 'Apagar', color: '#c0392b', disabled: !sel || readOnly, onClick: () => confirm(`Apagar "${selRow?.name}"?`) && del.mutate(sel!) },
        { icon: '🖶', label: 'Imprimir', color: '#333', onClick: () => window.print() },
        { icon: '⤓', label: 'Exportar para Excel', color: '#217346', onClick: exportCsv },
      ]} />
    </div>
  );
}
