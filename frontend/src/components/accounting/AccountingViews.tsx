import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import {
  LayoutDashboard, BookOpen, NotebookPen, ScrollText, Scale, FileBarChart, Plus, Trash2,
  CheckCircle, Undo2, Lock, Unlock, Zap, RefreshCw,
} from 'lucide-react';
import { accApi } from '../../api/accounting';

const AOA = (n: any) => new Intl.NumberFormat('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

function useCrud(resource: keyof typeof accApi, params?: any) {
  const qc = useQueryClient();
  const api = accApi[resource] as any;
  const inval = () => qc.invalidateQueries({ queryKey: ['acc'] });
  return {
    rows: (useQuery({ queryKey: ['acc', resource, params ?? {}], queryFn: () => api.list(params) }).data ?? []) as any[],
    create: useMutation({ mutationFn: (p: any) => api.create(p), onSuccess: inval }),
    update: useMutation({ mutationFn: ({ id, data }: any) => api.update(id, data), onSuccess: inval }),
    remove: useMutation({ mutationFn: (id: number) => api.remove(id), onSuccess: inval }),
  };
}
const Card = ({ label, value, tone, sub }: any) => (
  <div className="bg-white border border-[#a0a0a0] p-3"><div className="text-[10px] text-gray-500 uppercase">{label}</div>
    <div className={`text-xl font-bold ${tone || 'text-[#1e3f66]'}`}>{value}</div>{sub && <div className="text-[11px] text-gray-500">{sub}</div>}</div>
);

// ==================== Dashboard ====================
export function AccDashboardView() {
  const { data: d } = useQuery({ queryKey: ['acc', 'dashboard'], queryFn: () => accApi.dashboard() });
  return (
    <ClassicWindow title="Contabilidade — Dashboard" icon={<LayoutDashboard size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Contabilidade Geral (PGC-AO)</div>}>
      <div className="p-3 grid grid-cols-4 gap-2">
        {!d ? <div className="col-span-4 text-center text-gray-400 py-8 text-[12px]">A carregar…</div> : <>
          <Card label="Total do Ativo" value={AOA(d.total_assets)} /><Card label="Total do Passivo" value={AOA(d.total_liabilities)} />
          <Card label="Proveitos" value={AOA(d.total_income)} tone="text-green-700" /><Card label="Custos" value={AOA(d.total_expense)} tone="text-amber-700" />
          <Card label="Resultado líquido" value={AOA(d.net_result)} tone={d.net_result >= 0 ? 'text-green-700' : 'text-red-600'} sub={d.net_result >= 0 ? 'Lucro' : 'Prejuízo'} />
          <Card label="Contas de movimento" value={d.movement_accounts} /><Card label="Lançamentos" value={d.entries_posted} sub={`${d.entries_draft} rascunhos`} /><Card label="Diários" value={d.journals} />
        </>}
      </div>
    </ClassicWindow>
  );
}

// ==================== Plano de Contas ====================
export function AccChartView() {
  const { rows, create, remove } = useCrud('accounts');
  const CLASSES: Record<string, string> = { '1': 'Meios Financeiros', '2': 'Terceiros', '3': 'Existências', '4': 'Imobilizações', '5': 'Fundos Próprios', '6': 'Proveitos', '7': 'Custos', '8': 'Resultados' };
  const TYPES: Record<string, string> = { ASSET: 'Ativo', LIABILITY: 'Passivo', EQUITY: 'Fundos Próprios', INCOME: 'Proveitos', EXPENSE: 'Custos', RESULT: 'Resultados' };
  const [f, setF] = useState<any>({ code: '', name: '', account_class: '1', account_type: 'ASSET', normal_side: 'D', is_movement: true });
  const add = () => { if (!f.code || !f.name) return; create.mutate(f, { onSuccess: () => setF({ ...f, code: '', name: '' }) }); };
  return (
    <ClassicWindow title="Plano de Contas (PGC-AO)" icon={<BookOpen size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Contas: {rows.length}</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <input placeholder="Código" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
          <input placeholder="Nome da conta" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <select value={f.account_class} onChange={(e) => setF({ ...f, account_class: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">{Object.entries(CLASSES).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}</select>
          <select value={f.account_type} onChange={(e) => setF({ ...f, account_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select value={f.normal_side} onChange={(e) => setF({ ...f, normal_side: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white"><option value="D">Devedora</option><option value="C">Credora</option></select>
          <label className="flex items-center gap-1"><input type="checkbox" checked={f.is_movement} onChange={(e) => setF({ ...f, is_movement: e.target.checked })} />Movimento</label>
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Código', accessor: (r: any) => <span style={{ paddingLeft: (r.code.length - 1) * 10 }} className={r.is_movement ? '' : 'font-bold'}>{r.code}</span>, width: '14%' },
            { header: 'Conta', accessor: (r: any) => <span className={r.is_movement ? '' : 'font-bold'}>{r.name}</span>, width: '40%' },
            { header: 'Classe', accessor: (r: any) => CLASSES[r.account_class], width: '18%' },
            { header: 'Tipo', accessor: (r: any) => TYPES[r.account_type], width: '14%' },
            { header: 'Lado', accessor: (r: any) => r.normal_side === 'D' ? 'Dev.' : 'Cred.', width: '8%' },
            { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '6%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

// ==================== Lançamentos ====================
const emptyLine = () => ({ account: '', debit: '', credit: '' });
export function AccEntriesView() {
  const qc = useQueryClient();
  const { rows, create, remove } = useCrud('entries');
  const journals = useCrud('journals').rows;
  const accounts = (useQuery({ queryKey: ['acc', 'accounts', 'mov'], queryFn: () => accApi.accounts.list({ is_movement: '1' }) }).data ?? []) as any[];
  const [selId, setSelId] = useState<number | null>(null);
  const sel = rows.find((r: any) => r.id === selId);
  const [hdr, setHdr] = useState<any>({ journal: '', entry_date: new Date().toISOString().slice(0, 10), description: '' });
  const [lines, setLines] = useState<any[]>([emptyLine(), emptyLine()]);

  const totD = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totC = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = totD === totC && totD > 0;

  const setLine = (i: number, patch: any) => setLines(lines.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const save = () => {
    if (!hdr.journal || !hdr.description || !balanced) return;
    const payload = { ...hdr, journal: Number(hdr.journal), source: 'MANUAL',
      lines: lines.filter((l) => l.account && (Number(l.debit) || Number(l.credit)))
        .map((l) => ({ account: Number(l.account), debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })) };
    create.mutate(payload, { onSuccess: (e: any) => { setSelId(e.id); setHdr({ journal: '', entry_date: new Date().toISOString().slice(0, 10), description: '' }); setLines([emptyLine(), emptyLine()]); } });
  };
  const post = (id: number) => accApi.postEntry(id).then(() => qc.invalidateQueries({ queryKey: ['acc'] })).catch((e) => alert(e?.response?.data?.detail || 'Erro ao lançar.'));
  const reverse = (id: number) => accApi.reverseEntry(id).then(() => qc.invalidateQueries({ queryKey: ['acc'] }));

  return (
    <ClassicWindow title="Lançamentos Contabilísticos" icon={<NotebookPen size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Lançamentos: {rows.length}</div>}>
      <div className="flex h-full">
        {/* Lista */}
        <div className="w-2/5 border-r border-[#a0a0a0] flex flex-col">
          <div className="flex-1 overflow-hidden">
            <ClassicGrid rowKey="id" data={rows} selectedRowId={selId ?? undefined} onRowClick={(r: any) => setSelId(r.id)} columns={[
              { header: 'Nº', accessor: 'number', width: '22%' }, { header: 'Data', accessor: 'entry_date', width: '20%' },
              { header: 'Descrição', accessor: 'description', width: '36%' },
              { header: 'Estado', accessor: (r: any) => <span className={r.status === 'POSTED' ? 'text-green-700 font-bold' : r.status === 'REVERSED' ? 'text-gray-500' : 'text-amber-700'}>{r.status_display}</span>, width: '22%' },
            ]} />
          </div>
        </div>
        {/* Editor / detalhe */}
        <div className="w-3/5 flex flex-col">
          {sel ? (
            <div className="flex-1 overflow-auto p-2 text-[11px]">
              <div className="flex items-center justify-between mb-2">
                <div><b>{sel.number}</b> · {sel.journal_name} · {sel.entry_date}<br /><span className="text-gray-600">{sel.description}</span></div>
                <div className="flex gap-1">
                  {sel.status === 'DRAFT' && <ClassicButton icon={CheckCircle} label="Lançar" onClick={() => post(sel.id)} />}
                  {sel.status === 'POSTED' && <ClassicButton icon={Undo2} label="Estornar" onClick={() => reverse(sel.id)} />}
                  {sel.status === 'DRAFT' && <button onClick={() => { remove.mutate(sel.id); setSelId(null); }} className="text-red-600"><Trash2 size={14} /></button>}
                </div>
              </div>
              <ClassicGrid rowKey="id" data={sel.lines || []} columns={[
                { header: 'Conta', accessor: (r: any) => `${r.account_code} · ${r.account_name}`, width: '56%' },
                { header: 'Débito', accessor: (r: any) => Number(r.debit) ? AOA(r.debit) : '', width: '22%' },
                { header: 'Crédito', accessor: (r: any) => Number(r.credit) ? AOA(r.credit) : '', width: '22%' },
              ]} />
              <div className="flex justify-end gap-4 mt-2 pr-2 font-bold"><span>Débito: {AOA(sel.total_debit)}</span><span>Crédito: {AOA(sel.total_credit)}</span></div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto p-2 text-[11px]">
              <div className="font-bold text-[#1e3f66] mb-2">Novo lançamento</div>
              <div className="flex flex-wrap items-end gap-2 mb-2">
                <select value={hdr.journal} onChange={(e) => setHdr({ ...hdr, journal: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white"><option value="">Diário…</option>{journals.map((j: any) => <option key={j.id} value={j.id}>{j.code} · {j.name}</option>)}</select>
                <input type="date" value={hdr.entry_date} onChange={(e) => setHdr({ ...hdr, entry_date: e.target.value })} className="border border-[#a0a0a0] p-1" />
                <input placeholder="Descrição" value={hdr.description} onChange={(e) => setHdr({ ...hdr, description: e.target.value })} className="border border-[#a0a0a0] p-1 flex-1" />
              </div>
              <table className="w-full border-collapse">
                <thead><tr className="bg-[#f0f0f0] text-left"><th className="p-1 border border-[#d0d0d0]">Conta</th><th className="p-1 border border-[#d0d0d0] w-24">Débito</th><th className="p-1 border border-[#d0d0d0] w-24">Crédito</th><th className="w-6"></th></tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td className="border border-[#e0e0e0] p-0.5"><select value={l.account} onChange={(e) => setLine(i, { account: e.target.value })} className="w-full border-none bg-transparent"><option value="">—</option>{accounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></td>
                      <td className="border border-[#e0e0e0] p-0.5"><input type="number" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: '' })} className="w-full border-none text-right" /></td>
                      <td className="border border-[#e0e0e0] p-0.5"><input type="number" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: '' })} className="w-full border-none text-right" /></td>
                      <td className="text-center"><button onClick={() => setLines(lines.filter((_, x) => x !== i))} className="text-red-600"><Trash2 size={11} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between mt-2">
                <ClassicButton icon={Plus} label="Linha" onClick={() => setLines([...lines, emptyLine()])} />
                <div className={`font-bold ${balanced ? 'text-green-700' : 'text-red-600'}`}>D: {AOA(totD)} · C: {AOA(totC)} {balanced ? '✓ Salda' : '✗ Não salda'}</div>
              </div>
              <div className="mt-2"><ClassicButton icon={CheckCircle} label="Guardar lançamento" onClick={save} /></div>
              {rows.length > 0 && <div className="text-gray-400 mt-4">Selecione um lançamento na lista para ver/lançar.</div>}
            </div>
          )}
          {sel && <div className="p-2 border-t border-[#a0a0a0]"><ClassicButton label="+ Novo lançamento" onClick={() => setSelId(null)} /></div>}
        </div>
      </div>
    </ClassicWindow>
  );
}

// ==================== Diários & Períodos ====================
export function AccJournalsView() {
  const j = useCrud('journals');
  const p = useCrud('periods');
  const qc = useQueryClient();
  const TYPES: Record<string, string> = { SALES: 'Vendas', PURCHASES: 'Compras', CASH: 'Caixa', BANK: 'Banco', GENERAL: 'Diversas', OPENING: 'Abertura' };
  const [nj, setNj] = useState<any>({ code: '', name: '', journal_type: 'GENERAL' });
  const toggleClose = (id: number) => accApi.toggleClosePeriod(id).then(() => qc.invalidateQueries({ queryKey: ['acc'] }));
  return (
    <ClassicWindow title="Diários & Exercícios" icon={<ScrollText size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Diários: {j.rows.length} · Exercícios: {p.rows.length}</div>}>
      <div className="flex h-full">
        <div className="w-1/2 border-r border-[#a0a0a0] flex flex-col">
          <div className="flex flex-wrap items-end gap-2 p-2 bg-[#f0f0f0] border-b border-[#a0a0a0] text-[11px]">
            <input placeholder="Cód." value={nj.code} onChange={(e) => setNj({ ...nj, code: e.target.value })} className="border border-[#a0a0a0] p-1 w-14" />
            <input placeholder="Nome do diário" value={nj.name} onChange={(e) => setNj({ ...nj, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
            <select value={nj.journal_type} onChange={(e) => setNj({ ...nj, journal_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <ClassicButton icon={Plus} label="Add" onClick={() => nj.code && nj.name && j.create.mutate(nj, { onSuccess: () => setNj({ code: '', name: '', journal_type: 'GENERAL' }) })} />
          </div>
          <div className="flex-1 overflow-hidden"><ClassicGrid rowKey="id" data={j.rows} columns={[
            { header: 'Cód.', accessor: 'code', width: '18%' }, { header: 'Diário', accessor: 'name', width: '52%' }, { header: 'Tipo', accessor: (r: any) => TYPES[r.journal_type], width: '30%' },
          ]} /></div>
        </div>
        <div className="w-1/2 flex flex-col">
          <div className="p-2 bg-[#f0f0f0] border-b border-[#a0a0a0] text-[11px] font-bold">Exercícios contabilísticos</div>
          <div className="flex-1 overflow-hidden"><ClassicGrid rowKey="id" data={p.rows} columns={[
            { header: 'Exercício', accessor: 'name', width: '28%' }, { header: 'Início', accessor: 'start_date', width: '24%' }, { header: 'Fim', accessor: 'end_date', width: '24%' },
            { header: 'Estado', accessor: (r: any) => <button onClick={() => toggleClose(r.id)} className={`flex items-center gap-1 ${r.is_closed ? 'text-red-600' : 'text-green-700'}`}>{r.is_closed ? <><Lock size={11} />Fechado</> : <><Unlock size={11} />Aberto</>}</button>, width: '24%' },
          ]} /></div>
        </div>
      </div>
    </ClassicWindow>
  );
}

// ==================== Razão ====================
export function AccLedgerView() {
  const accounts = (useQuery({ queryKey: ['acc', 'accounts', 'mov'], queryFn: () => accApi.accounts.list({ is_movement: '1' }) }).data ?? []) as any[];
  const [code, setCode] = useState('');
  const { data } = useQuery({ queryKey: ['acc', 'ledger', code], queryFn: () => accApi.ledger(code), enabled: !!code });
  const rows = data?.rows ?? [];
  return (
    <ClassicWindow title="Razão (movimentos por conta)" icon={<ScrollText size={14} className="text-gray-300" />} footer={<div className="text-gray-600">{data ? `Saldo final: ${AOA(data.final_balance)}` : 'Selecione uma conta'}</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <select value={code} onChange={(e) => setCode(e.target.value)} className="border border-[#a0a0a0] p-1 bg-white"><option value="">Conta…</option>{accounts.map((a: any) => <option key={a.id} value={a.code}>{a.code} · {a.name}</option>)}</select>
          {data && <span className="text-gray-600">{data.account.name} ({data.account.normal_side === 'D' ? 'devedora' : 'credora'})</span>}
        </div>
        <div className="flex-1 overflow-hidden"><ClassicGrid rowKey="entry" data={rows} columns={[
          { header: 'Data', accessor: 'date', width: '14%' }, { header: 'Lançamento', accessor: 'entry', width: '16%' }, { header: 'Descrição', accessor: 'description', width: '34%' },
          { header: 'Débito', accessor: (r: any) => Number(r.debit) ? AOA(r.debit) : '', width: '12%' }, { header: 'Crédito', accessor: (r: any) => Number(r.credit) ? AOA(r.credit) : '', width: '12%' },
          { header: 'Saldo', accessor: (r: any) => AOA(r.balance), width: '12%' },
        ]} />
        {!code && <div className="text-center text-gray-400 text-[12px] py-8">Escolha uma conta para ver o razão.</div>}</div>
      </div>
    </ClassicWindow>
  );
}

// ==================== Balancete ====================
export function AccTrialBalanceView() {
  const { data } = useQuery({ queryKey: ['acc', 'trialBalance'], queryFn: () => accApi.trialBalance() });
  const rows = data?.rows ?? [];
  const t = data?.totals;
  return (
    <ClassicWindow title="Balancete" icon={<Scale size={14} className="text-gray-300" />} footer={<div className="text-gray-600">{t ? <>Total D: {AOA(t.debit)} · C: {AOA(t.credit)} · {data.balanced ? <span className="text-green-700 font-bold">Balanceado ✓</span> : <span className="text-red-600 font-bold">Desequilibrado</span>}</> : '—'}</div>}>
      <div className="p-2 h-full"><ClassicGrid rowKey="code" data={rows} columns={[
        { header: 'Conta', accessor: (r: any) => `${r.code} · ${r.name}`, width: '40%' },
        { header: 'Débito', accessor: (r: any) => AOA(r.debit), width: '15%' }, { header: 'Crédito', accessor: (r: any) => AOA(r.credit), width: '15%' },
        { header: 'Saldo Dev.', accessor: (r: any) => r.saldo_devedor ? AOA(r.saldo_devedor) : '', width: '15%' }, { header: 'Saldo Cred.', accessor: (r: any) => r.saldo_credor ? AOA(r.saldo_credor) : '', width: '15%' },
      ]} />
      {rows.length === 0 && <div className="text-center text-gray-400 text-[12px] py-8">Sem movimentos lançados.</div>}</div>
    </ClassicWindow>
  );
}

// ==================== Integração Contabilística (auto-posting) ====================
export function AccIntegrationView() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['acc', 'autoPost'], queryFn: () => accApi.autoPostPending() });
  const run = useMutation({
    mutationFn: (sources: string[]) => accApi.runAutoPost(sources, true),
    onSuccess: (r: any) => { alert(r.detail); qc.invalidateQueries({ queryKey: ['acc'] }); },
  });
  const p = data?.pending ?? { pos: [], purchase: [], treasury: [] };
  const Section = ({ title, source, rows }: any) => (
    <div className="bg-white border border-[#a0a0a0]">
      <div className="bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-1.5 text-[11px] font-bold flex items-center justify-between">
        <span>{title} — {rows.length} pendente(s)</span>
        {rows.length > 0 && <ClassicButton icon={Zap} label="Contabilizar" onClick={() => run.mutate([source])} />}
      </div>
      <div className="max-h-40 overflow-auto">
        <ClassicGrid rowKey="ref" data={rows} columns={[
          { header: 'Documento', accessor: (r: any) => `${r.kind ? r.kind + ' ' : ''}${r.ref}`, width: '46%' },
          { header: 'Data', accessor: 'date', width: '27%' },
          { header: 'Valor', accessor: (r: any) => AOA(r.amount), width: '27%' },
        ]} />
        {rows.length === 0 && <div className="text-center text-gray-400 text-[11px] py-3">Tudo contabilizado ✓</div>}
      </div>
    </div>
  );
  return (
    <ClassicWindow title="Integração Contabilística (Auto-Posting)" icon={<Zap size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{data ? `${data.total} documento(s) por contabilizar` : '—'}</div>}>
      <div className="p-3 space-y-3">
        <div className="bg-[#eef4fb] border border-[#a0a0a0] px-3 py-2 text-[11px] text-gray-700 flex items-center justify-between">
          <span>Gera lançamentos automaticamente: <b>Venda POS</b> → Dr Caixa / Cr Vendas+IVA · <b>Compras</b> → Dr Existências / Cr Fornecedores · <b>Tesouraria</b> → Recebimentos/Pagamentos.</span>
          <div className="flex gap-1">
            <ClassicButton icon={RefreshCw} label="Atualizar" onClick={() => qc.invalidateQueries({ queryKey: ['acc', 'autoPost'] })} />
            <ClassicButton icon={Zap} label="Contabilizar tudo" onClick={() => run.mutate(['pos', 'purchase', 'treasury'])} />
          </div>
        </div>
        {isLoading ? <div className="text-center text-gray-400 py-8 text-[12px]">A carregar…</div> : <>
          <Section title="Vendas POS" source="pos" rows={p.pos} />
          <Section title="Compras (faturas de fornecedor)" source="purchase" rows={p.purchase} />
          <Section title="Tesouraria (recebimentos/pagamentos)" source="treasury" rows={p.treasury} />
        </>}

        {/* Apuramento de resultados (fecho de exercício) */}
        <div className="bg-white border border-[#a0a0a0]">
          <div className="bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-1.5 text-[11px] font-bold">Apuramento de Resultados (fecho de exercício)</div>
          <div className="p-3 flex items-center justify-between text-[11px]">
            <span className="text-gray-600">Transfere Proveitos (classe 6) e Custos (classe 7) para a conta de Resultado Líquido (88).</span>
            <ClassicButton icon={CheckCircle} label="Apurar resultados" onClick={async () => {
              const pv = await accApi.closeResultsPreview();
              if (!confirm(`Proveitos: ${AOA(pv.total_income)}\nCustos: ${AOA(pv.total_expense)}\nResultado: ${AOA(pv.net_result)} (${pv.result_label})\n\nGerar lançamento de apuramento?`)) return;
              try { const r = await accApi.closeResults(); alert(r.detail); qc.invalidateQueries({ queryKey: ['acc'] }); }
              catch (e: any) { alert(e?.response?.data?.detail || 'Erro no apuramento.'); }
            }} />
          </div>
        </div>
      </div>
    </ClassicWindow>
  );
}

// ==================== Demonstrações Financeiras ====================
export function AccStatementsView() {
  const { data: is_ } = useQuery({ queryKey: ['acc', 'incomeStatement'], queryFn: () => accApi.incomeStatement() });
  const { data: bs } = useQuery({ queryKey: ['acc', 'balanceSheet'], queryFn: () => accApi.balanceSheet() });
  const Line = ({ label, value, bold }: any) => <div className={`flex justify-between py-0.5 border-b border-[#eee] text-[11px] ${bold ? 'font-bold' : ''}`}><span>{label}</span><span>{AOA(value)}</span></div>;
  const Panel = ({ title, children }: any) => <div className="bg-white border border-[#a0a0a0]"><div className="bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-1.5 text-[11px] font-bold">{title}</div><div className="p-2">{children}</div></div>;
  return (
    <ClassicWindow title="Demonstrações Financeiras" icon={<FileBarChart size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Demonstração de Resultados + Balanço (PGC-AO)</div>}>
      <div className="p-3 grid grid-cols-2 gap-3">
        <Panel title="Demonstração de Resultados">
          {is_ ? <>
            <div className="text-[10px] text-gray-500 uppercase mt-1">Proveitos</div>
            {is_.income.map((x: any, i: number) => <Line key={i} label={x.name} value={x.amount} />)}
            <Line label="Total Proveitos" value={is_.total_income} bold />
            <div className="text-[10px] text-gray-500 uppercase mt-2">Custos</div>
            {is_.expense.map((x: any, i: number) => <Line key={i} label={x.name} value={x.amount} />)}
            <Line label="Total Custos" value={is_.total_expense} bold />
            <div className={`flex justify-between py-1 mt-1 font-bold text-[12px] ${is_.net_result >= 0 ? 'text-green-700' : 'text-red-600'}`}><span>Resultado ({is_.result_label})</span><span>{AOA(is_.net_result)}</span></div>
          </> : <div className="text-gray-400">A carregar…</div>}
        </Panel>
        <Panel title="Balanço">
          {bs ? <>
            <div className="text-[10px] text-gray-500 uppercase mt-1">Ativo</div>
            {bs.assets.map((x: any, i: number) => <Line key={i} label={x.name} value={x.amount} />)}
            <Line label="Total do Ativo" value={bs.total_assets} bold />
            <div className="text-[10px] text-gray-500 uppercase mt-2">Passivo</div>
            {bs.liabilities.map((x: any, i: number) => <Line key={i} label={x.name} value={x.amount} />)}
            <Line label="Total do Passivo" value={bs.total_liabilities} bold />
            <div className="text-[10px] text-gray-500 uppercase mt-2">Fundos Próprios</div>
            {bs.equity.map((x: any, i: number) => <Line key={i} label={x.name} value={x.amount} />)}
            <Line label="Resultado do exercício" value={bs.net_result} />
            <Line label="Total Fundos Próprios" value={bs.total_equity} bold />
            <div className={`flex justify-between py-1 mt-1 font-bold text-[12px] ${bs.balanced ? 'text-green-700' : 'text-red-600'}`}><span>Passivo + Fundos Próprios {bs.balanced ? '✓' : '✗'}</span><span>{AOA(bs.total_liabilities_equity)}</span></div>
          </> : <div className="text-gray-400">A carregar…</div>}
        </Panel>
      </div>
    </ClassicWindow>
  );
}
