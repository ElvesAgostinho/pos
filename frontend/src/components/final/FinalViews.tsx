import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import {
  GitBranch, ListTodo, LayoutDashboard, Undo2, ClipboardList, ShoppingCart, Award,
  Banknote, Building, ShieldCheck, KeyRound, Fingerprint, Plus, Trash2, CheckCircle,
} from 'lucide-react';
import { finalApi } from '../../api/final';

const AOA = (n: any) => new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 }).format(Number(n) || 0) + ' Kz';

function useCrud(resource: keyof typeof finalApi, params?: any) {
  const qc = useQueryClient();
  const api = finalApi[resource] as any;
  const inval = () => qc.invalidateQueries({ queryKey: ['final', resource] });
  return {
    rows: (useQuery({ queryKey: ['final', resource, params ?? {}], queryFn: () => api.list(params) }).data ?? []) as any[],
    create: useMutation({ mutationFn: (p: any) => api.create(p), onSuccess: inval }),
    update: useMutation({ mutationFn: ({ id, data }: any) => api.update(id, data), onSuccess: inval }),
    remove: useMutation({ mutationFn: (id: number) => api.remove(id), onSuccess: inval }),
  };
}

function Card({ label, value, tone, sub }: any) {
  return (
    <div className="bg-white border border-[#a0a0a0] p-3">
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      <div className={`text-2xl font-bold ${tone || 'text-[#1e3f66]'}`}>{value ?? '—'}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
    </div>
  );
}

// ==================== Workflow (19) ====================
export function WfcDashboardView() {
  const { data: d } = useQuery({ queryKey: ['final', 'wfDashboard'], queryFn: () => finalApi.wfDashboard() });
  return (
    <ClassicWindow title="Workflow — Dashboard" icon={<LayoutDashboard size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Centro 19 · fluxos e tarefas</div>}>
      <div className="p-3 grid grid-cols-4 gap-2">
        {!d ? <div className="col-span-4 text-center text-gray-400 py-8 text-[12px]">A carregar…</div> : <>
          <Card label="Fluxos ativos" value={d.flows} /><Card label="Tarefas pendentes" value={d.tasks_pending} tone="text-amber-700" />
          <Card label="Em curso" value={d.tasks_in_progress} /><Card label="Concluídas" value={d.tasks_done} tone="text-green-700" />
          <Card label="Urgentes por fechar" value={d.tasks_urgent} tone={d.tasks_urgent ? 'text-red-700' : 'text-green-700'} /><Card label="Total tarefas" value={d.tasks_total} />
        </>}
      </div>
    </ClassicWindow>
  );
}

export function WfcFlowsView() {
  const { rows, create, remove } = useCrud('flows');
  const [f, setF] = useState<any>({ name: '', trigger_event: '', description: '' });
  const add = () => { if (!f.name) return; create.mutate(f, { onSuccess: () => setF({ name: '', trigger_event: '', description: '' }) }); };
  return (
    <ClassicWindow title="Workflow — Fluxos" icon={<GitBranch size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Fluxos: {rows.length}</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <input placeholder="Nome do fluxo" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input placeholder="Evento gatilho" value={f.trigger_event} onChange={(e) => setF({ ...f, trigger_event: e.target.value })} className="border border-[#a0a0a0] p-1 w-40" />
          <input placeholder="Descrição" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <ClassicButton icon={Plus} label="Criar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Fluxo', accessor: 'name', width: '32%' }, { header: 'Gatilho', accessor: (r: any) => r.trigger_event || '—', width: '24%' },
            { header: 'Tarefas', accessor: 'task_count', width: '12%' }, { header: 'Descrição', accessor: (r: any) => r.description || '—', width: '26%' },
            { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '6%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

export function WfcTasksView() {
  const { rows, create, update, remove } = useCrud('wfTasks');
  const flows = useCrud('flows').rows;
  const ST: Record<string, string> = { PENDING: 'Pendente', IN_PROGRESS: 'Em curso', DONE: 'Concluída', CANCELLED: 'Cancelada' };
  const PR: Record<string, string> = { LOW: 'Baixa', NORMAL: 'Normal', HIGH: 'Alta', URGENT: 'Urgente' };
  const [f, setF] = useState<any>({ title: '', assignee: '', priority: 'NORMAL', flow: '', due_date: '' });
  const add = () => { if (!f.title) return; create.mutate({ ...f, flow: f.flow ? Number(f.flow) : null, due_date: f.due_date || null }, { onSuccess: () => setF({ title: '', assignee: '', priority: 'NORMAL', flow: '', due_date: '' }) }); };
  const ptone = (p: string) => p === 'URGENT' ? 'text-red-600 font-bold' : p === 'HIGH' ? 'text-amber-700' : 'text-gray-700';
  return (
    <ClassicWindow title="Workflow — Tarefas" icon={<ListTodo size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Tarefas: {rows.length}</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <input placeholder="Título" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input placeholder="Responsável" value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
          <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">{Object.entries(PR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select value={f.flow} onChange={(e) => setF({ ...f, flow: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white"><option value="">Fluxo…</option>{flows.map((fl: any) => <option key={fl.id} value={fl.id}>{fl.name}</option>)}</select>
          <input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <ClassicButton icon={Plus} label="Criar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Tarefa', accessor: 'title', width: '26%' }, { header: 'Responsável', accessor: (r: any) => r.assignee || '—', width: '14%' },
            { header: 'Fluxo', accessor: (r: any) => r.flow_name || '—', width: '16%' },
            { header: 'Prioridade', accessor: (r: any) => <span className={ptone(r.priority)}>{PR[r.priority]}</span>, width: '12%' },
            { header: 'Estado', accessor: (r: any) => <select value={r.status} onChange={(e) => update.mutate({ id: r.id, data: { status: e.target.value } })} className="bg-transparent border-none text-[11px]">{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>, width: '14%' },
            { header: 'Prazo', accessor: (r: any) => r.due_date || '—', width: '12%' },
            { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '6%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

// ==================== Compras (08) ====================
export function ProcDashboardView() {
  const { data: d } = useQuery({ queryKey: ['final', 'procDashboard'], queryFn: () => finalApi.procDashboard() });
  const sum = (o: any) => o ? Object.values(o).reduce((a: any, b: any) => a + b, 0) : 0;
  return (
    <ClassicWindow title="Compras — Dashboard" icon={<ShoppingCart size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Centro 08 · requisições, encomendas, receções</div>}>
      <div className="p-3 grid grid-cols-4 gap-2">
        {!d ? <div className="col-span-4 text-center text-gray-400 py-8 text-[12px]">A carregar…</div> : <>
          <Card label="Requisições" value={sum(d.requisitions)} /><Card label="Encomendas" value={sum(d.purchase_orders)} />
          <Card label="Receções (GRN)" value={d.goods_receipts} /><Card label="Devoluções" value={sum(d.returns)} />
          <Card label="A aguardar aprovação" value={d.pending_approval} tone={d.pending_approval ? 'text-amber-700' : 'text-green-700'} />
        </>}
      </div>
    </ClassicWindow>
  );
}

export function ProcReturnsView() {
  const { rows, create, update, remove } = useCrud('returns');
  const qc = useQueryClient();
  const doConfirm = (id: number) => finalApi.confirmReturn(id).then(() => qc.invalidateQueries({ queryKey: ['final', 'returns'] }));
  const suppliers = useQuery({ queryKey: ['final', 'suppliers'], queryFn: () => finalApi.suppliers() }).data ?? [];
  const warehouses = useQuery({ queryKey: ['final', 'warehouses'], queryFn: () => finalApi.warehouses() }).data ?? [];
  const [selId, setSelId] = useState<number | null>(null);
  const sel = rows.find((r: any) => r.id === selId);
  const [hdr, setHdr] = useState<any>({ supplier: '', warehouse: '', reason: '' });
  const items = useQuery({ queryKey: ['final', 'items'], queryFn: () => finalApi.items() }).data ?? [];
  const [ln, setLn] = useState<any>({ item: '', quantity: '' });
  const createRet = () => { if (!hdr.supplier || !hdr.warehouse) return; create.mutate({ supplier: Number(hdr.supplier), warehouse: Number(hdr.warehouse), reason: hdr.reason, lines: [] }, { onSuccess: (r: any) => { setSelId(r.id); setHdr({ supplier: '', warehouse: '', reason: '' }); } }); };
  const addLine = () => { if (!sel || !ln.item || !ln.quantity) return; const lines = [...(sel.lines || []).map((l: any) => ({ item: l.item, quantity: l.quantity })), { item: Number(ln.item), quantity: Number(ln.quantity) }]; update.mutate({ id: sel.id, data: { lines } }, { onSuccess: () => setLn({ item: '', quantity: '' }) }); };
  return (
    <ClassicWindow title="Compras — Devoluções a Fornecedor" icon={<Undo2 size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Devoluções: {rows.length}</div>}>
      <div className="flex h-full">
        <div className="w-1/2 border-r border-[#a0a0a0] flex flex-col">
          <div className="flex flex-wrap items-end gap-2 p-2 bg-[#f0f0f0] border-b border-[#a0a0a0] text-[11px]">
            <select value={hdr.supplier} onChange={(e) => setHdr({ ...hdr, supplier: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white max-w-[130px]"><option value="">Fornecedor…</option>{suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.commercial_name}</option>)}</select>
            <select value={hdr.warehouse} onChange={(e) => setHdr({ ...hdr, warehouse: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white"><option value="">Armazém…</option>{warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
            <ClassicButton icon={Plus} label="Nova" onClick={createRet} />
          </div>
          <div className="flex-1 overflow-hidden">
            <ClassicGrid rowKey="id" data={rows} selectedRowId={selId ?? undefined} onRowClick={(r: any) => setSelId(r.id)} columns={[
              { header: 'Nº', accessor: 'number', width: '20%' }, { header: 'Fornecedor', accessor: 'supplier_name', width: '40%' },
              { header: 'Estado', accessor: (r: any) => <span className={r.status === 'CONFIRMED' ? 'text-green-700 font-bold' : 'text-amber-700'}>{r.status_display}</span>, width: '28%' },
              { header: '', accessor: (r: any) => r.status !== 'CONFIRMED' ? <button onClick={(e) => { e.stopPropagation(); remove.mutate(r.id); }} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button> : null, width: '12%' },
            ]} />
          </div>
        </div>
        <div className="w-1/2 flex flex-col">
          {sel ? <>
            <div className="flex items-center justify-between p-2 bg-[#eef4fb] border-b border-[#a0a0a0] text-[11px]">
              <span className="font-bold">{sel.number} · {sel.supplier_name}</span>
              {sel.status !== 'CONFIRMED' ? <ClassicButton icon={CheckCircle} label="Confirmar (saída stock)" onClick={() => doConfirm(sel.id)} /> : <span className="text-green-700 font-bold">✓ Confirmada</span>}
            </div>
            {sel.status !== 'CONFIRMED' && <div className="flex flex-wrap items-end gap-2 p-2 bg-[#f0f0f0] border-b border-[#a0a0a0] text-[11px]">
              <select value={ln.item} onChange={(e) => setLn({ ...ln, item: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white max-w-[160px]"><option value="">Artigo…</option>{items.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
              <input type="number" placeholder="Qtd" value={ln.quantity} onChange={(e) => setLn({ ...ln, quantity: e.target.value })} className="border border-[#a0a0a0] p-1 w-16" />
              <ClassicButton icon={Plus} label="Linha" onClick={addLine} />
            </div>}
            <div className="flex-1 overflow-hidden">
              <ClassicGrid rowKey="id" data={(sel.lines || []).map((l: any, i: number) => ({ ...l, _idx: i }))} columns={[
                { header: 'Artigo', accessor: (r: any) => `${r.item_code || ''} ${r.item_name || ''}`.trim(), width: '65%' }, { header: 'Qtd', accessor: 'quantity', width: '35%' },
              ]} />
            </div>
          </> : <div className="flex-1 flex items-center justify-center text-gray-400 text-[12px]">Selecione ou crie uma devolução.</div>}
        </div>
      </div>
    </ClassicWindow>
  );
}

export function ProcPlanningView() {
  const { data: d } = useQuery({ queryKey: ['final', 'procPlanning'], queryFn: () => finalApi.procPlanning() });
  const rows = d?.suggestions ?? [];
  return (
    <ClassicWindow title="Compras — Planeamento de Necessidades" icon={<ClipboardList size={14} className="text-gray-300" />} footer={<div className="text-gray-600">{rows.length} sugestão(ões) · custo estimado {AOA(d?.total_est_cost)}</div>}>
      <div className="p-2 h-full">
        <ClassicGrid rowKey="code" data={rows} columns={[
          { header: 'Artigo', accessor: (r: any) => `${r.code} · ${r.item}`, width: '32%' }, { header: 'Armazém', accessor: 'warehouse', width: '18%' },
          { header: 'Em stock', accessor: (r: any) => <span className="text-red-600 font-bold">{r.on_hand}</span>, width: '12%' }, { header: 'Mínimo', accessor: 'min', width: '10%' },
          { header: 'Sugerido', accessor: (r: any) => <span className="text-green-700 font-bold">{r.suggested_qty}</span>, width: '12%' }, { header: 'Custo est.', accessor: (r: any) => AOA(r.est_cost), width: '16%' },
        ]} />
        {rows.length === 0 && <div className="text-center text-gray-400 text-[12px] py-8">Nenhum artigo abaixo do mínimo. Defina stock mínimo nos níveis de stock.</div>}
      </div>
    </ClassicWindow>
  );
}

// ==================== Comercial (06) ====================
export function ComDashboardView() {
  const { data: d } = useQuery({ queryKey: ['final', 'comDashboard'], queryFn: () => finalApi.comDashboard() });
  return (
    <ClassicWindow title="Comercial — Dashboard" icon={<LayoutDashboard size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Centro 06 · promoções, combos, fidelização</div>}>
      <div className="p-3 grid grid-cols-4 gap-2">
        {!d ? <div className="col-span-4 text-center text-gray-400 py-8 text-[12px]">A carregar…</div> : <>
          <Card label="Promoções ativas" value={d.promotions_active} sub={`${d.promotions_total} no total`} /><Card label="Combos" value={d.combos} />
          <Card label="Programas fidelização" value={d.loyalty_programs} /><Card label="Escalões" value={d.loyalty_tiers} />
          <Card label="Gift cards ativos" value={d.giftcards_active} /><Card label="Saldo gift cards" value={d.giftcards_balance != null ? AOA(d.giftcards_balance) : '—'} tone="text-green-700" />
        </>}
      </div>
    </ClassicWindow>
  );
}

export function ComLoyaltyView() {
  const { rows, create, remove } = useCrud('loyaltyPrograms');
  const [selId, setSelId] = useState<number | null>(null);
  const sel = rows.find((p: any) => p.id === selId);
  const tiers = useCrud('loyaltyTiers', selId ? { program: selId } : undefined);
  const [f, setF] = useState<any>({ name: '', points_per_currency: '1', redeem_value: '1', min_redeem_points: '100' });
  const [t, setT] = useState<any>({ name: '', min_points: '', discount_percent: '', benefits: '' });
  const addProg = () => { if (!f.name) return; create.mutate({ ...f, points_per_currency: Number(f.points_per_currency), redeem_value: Number(f.redeem_value), min_redeem_points: Number(f.min_redeem_points) }, { onSuccess: (p: any) => { setSelId(p.id); setF({ name: '', points_per_currency: '1', redeem_value: '1', min_redeem_points: '100' }); } }); };
  const addTier = () => { if (!sel || !t.name) return; tiers.create.mutate({ program: sel.id, name: t.name, min_points: Number(t.min_points) || 0, discount_percent: Number(t.discount_percent) || 0, benefits: t.benefits }, { onSuccess: () => setT({ name: '', min_points: '', discount_percent: '', benefits: '' }) }); };
  return (
    <ClassicWindow title="Comercial — Fidelização (Loyalty)" icon={<Award size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Programas: {rows.length}</div>}>
      <div className="flex h-full">
        <div className="w-1/2 border-r border-[#a0a0a0] flex flex-col">
          <div className="flex flex-wrap items-end gap-2 p-2 bg-[#f0f0f0] border-b border-[#a0a0a0] text-[11px]">
            <input placeholder="Programa" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
            <input type="number" placeholder="Pts/Kz" value={f.points_per_currency} onChange={(e) => setF({ ...f, points_per_currency: e.target.value })} className="border border-[#a0a0a0] p-1 w-16" title="Pontos por Kz gasto" />
            <input type="number" placeholder="Kz/pt" value={f.redeem_value} onChange={(e) => setF({ ...f, redeem_value: e.target.value })} className="border border-[#a0a0a0] p-1 w-16" title="Valor de resgate por ponto" />
            <ClassicButton icon={Plus} label="Criar" onClick={addProg} />
          </div>
          <div className="flex-1 overflow-hidden">
            <ClassicGrid rowKey="id" data={rows} selectedRowId={selId ?? undefined} onRowClick={(r: any) => setSelId(r.id)} columns={[
              { header: 'Programa', accessor: 'name', width: '44%' }, { header: 'Pts/Kz', accessor: 'points_per_currency', width: '18%' },
              { header: 'Escalões', accessor: 'tier_count', width: '18%' },
              { header: '', accessor: (r: any) => <button onClick={(e) => { e.stopPropagation(); remove.mutate(r.id); }} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '10%' },
            ]} />
          </div>
        </div>
        <div className="w-1/2 flex flex-col">
          {sel ? <>
            <div className="flex flex-wrap items-end gap-2 p-2 bg-[#f0f0f0] border-b border-[#a0a0a0] text-[11px]">
              <input placeholder="Escalão (Ouro…)" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
              <input type="number" placeholder="Min. pts" value={t.min_points} onChange={(e) => setT({ ...t, min_points: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
              <input type="number" placeholder="Desc.%" value={t.discount_percent} onChange={(e) => setT({ ...t, discount_percent: e.target.value })} className="border border-[#a0a0a0] p-1 w-16" />
              <input placeholder="Benefícios" value={t.benefits} onChange={(e) => setT({ ...t, benefits: e.target.value })} className="border border-[#a0a0a0] p-1" />
              <ClassicButton icon={Plus} label="Escalão" onClick={addTier} />
            </div>
            <div className="flex-1 overflow-hidden">
              <ClassicGrid rowKey="id" data={tiers.rows} columns={[
                { header: 'Escalão', accessor: 'name', width: '28%' }, { header: 'Min. pts', accessor: 'min_points', width: '18%' },
                { header: 'Desconto', accessor: (r: any) => `${r.discount_percent}%`, width: '16%' }, { header: 'Benefícios', accessor: (r: any) => r.benefits || '—', width: '30%' },
                { header: '', accessor: (r: any) => <button onClick={() => tiers.remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '8%' },
              ]} />
            </div>
          </> : <div className="flex-1 flex items-center justify-center text-gray-400 text-[12px]">Selecione um programa para gerir escalões.</div>}
        </div>
      </div>
    </ClassicWindow>
  );
}

// ==================== Finanças (14) ====================
export function FinReconciliationView() {
  const qc = useQueryClient();
  const { data: bal } = useQuery({ queryKey: ['final', 'accountBalances'], queryFn: () => finalApi.accountBalances() });
  const { rows, create } = useCrud('reconciliations');
  const accounts = bal?.accounts ?? [];
  const [f, setF] = useState<any>({ account: '', statement_date: new Date().toISOString().slice(0, 10), statement_balance: '' });
  const acc = accounts.find((a: any) => String(a.id) === String(f.account));
  const diff = acc ? (Number(f.statement_balance || 0) - acc.balance) : 0;
  const add = () => { if (!f.account) return; create.mutate({ account: Number(f.account), statement_date: f.statement_date, statement_balance: Number(f.statement_balance) || 0 }, { onSuccess: () => { setF({ ...f, statement_balance: '' }); qc.invalidateQueries({ queryKey: ['final', 'accountBalances'] }); } }); };
  return (
    <ClassicWindow title="Finanças — Reconciliação Bancária" icon={<Banknote size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Reconciliações: {rows.length}</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <select value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white"><option value="">Conta…</option>{accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}</select>
          {acc && <span className="text-gray-600">Sistema: <b>{AOA(acc.balance)}</b></span>}
          <input type="date" value={f.statement_date} onChange={(e) => setF({ ...f, statement_date: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input type="number" placeholder="Saldo extrato" value={f.statement_balance} onChange={(e) => setF({ ...f, statement_balance: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
          {acc && f.statement_balance !== '' && <span className={Math.abs(diff) < 0.01 ? 'text-green-700 font-bold' : 'text-red-600 font-bold'}>Dif: {AOA(diff)}</span>}
          <ClassicButton icon={Plus} label="Reconciliar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Data', accessor: 'statement_date', width: '16%' }, { header: 'Conta', accessor: 'account_name', width: '24%' },
            { header: 'Extrato', accessor: (r: any) => AOA(r.statement_balance), width: '18%' }, { header: 'Sistema', accessor: (r: any) => AOA(r.system_balance), width: '18%' },
            { header: 'Diferença', accessor: (r: any) => <span className={Math.abs(Number(r.difference)) < 0.01 ? 'text-green-700 font-bold' : 'text-red-600 font-bold'}>{AOA(r.difference)}</span>, width: '18%' },
            { header: 'Estado', accessor: (r: any) => r.status_display, width: '6%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

// ==================== Admin (01) ====================
export function AdmGroupsView() {
  const { rows, create, remove } = useCrud('groups');
  const [name, setName] = useState('');
  const add = () => { if (!name) return; create.mutate({ name }, { onSuccess: () => setName('') }); };
  return (
    <ClassicWindow title="Administração — Grupos Empresariais" icon={<Building size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Grupos: {rows.length}</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <input placeholder="Nome do grupo" value={name} onChange={(e) => setName(e.target.value)} className="border border-[#a0a0a0] p-1" />
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'ID', accessor: 'id', width: '14%' }, { header: 'Grupo', accessor: 'name', width: '78%' },
            { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '8%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

export function AdmModuleStatusView() {
  const { data: mods } = useQuery({ queryKey: ['final', 'modules'], queryFn: () => finalApi.modules() });
  const { data: feats } = useQuery({ queryKey: ['final', 'features'], queryFn: () => finalApi.features() });
  const modules = Array.isArray(mods) ? mods : (mods?.modules ?? mods?.active_modules ?? []);
  const features = feats?.features ?? feats?.active ?? (Array.isArray(feats) ? feats : []);
  return (
    <ClassicWindow title="Administração — Estado dos Módulos" icon={<ShieldCheck size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Módulos e funcionalidades licenciadas</div>}>
      <div className="p-3 grid grid-cols-2 gap-3">
        <div className="bg-white border border-[#a0a0a0]"><div className="bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-1.5 text-[11px] font-bold">Módulos ativos ({modules.length})</div>
          <div className="p-2 text-[12px]">{modules.length ? modules.map((m: any, i: number) => <div key={i} className="py-0.5 border-b border-[#eee]">✓ {typeof m === 'string' ? m : (m.name || m.code || JSON.stringify(m))}</div>) : <div className="text-gray-400">Sem informação.</div>}</div>
        </div>
        <div className="bg-white border border-[#a0a0a0]"><div className="bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-1.5 text-[11px] font-bold">Funcionalidades ({features.length})</div>
          <div className="p-2 text-[12px]">{features.length ? features.map((m: any, i: number) => <div key={i} className="py-0.5 border-b border-[#eee]">• {typeof m === 'string' ? m : (m.name || m.key || JSON.stringify(m))}</div>) : <div className="text-gray-400">Sem restrições / sem informação.</div>}</div>
        </div>
      </div>
    </ClassicWindow>
  );
}

export function AdmVersionsView() {
  const { data: d } = useQuery({ queryKey: ['final', 'systemInfo'], queryFn: () => finalApi.systemInfo() });
  const Row = ({ k, v }: any) => <div className="flex justify-between border-b border-[#eee] py-1 text-[12px]"><span className="text-gray-500">{k}</span><span className="font-mono">{v}</span></div>;
  return (
    <ClassicWindow title="Administração — Versões" icon={<ShieldCheck size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Informação de versão e ambiente</div>}>
      <div className="p-3">{!d ? <div className="text-center text-gray-400 py-8 text-[12px]">A carregar…</div> : (
        <div className="bg-white border border-[#a0a0a0] p-3 max-w-lg">
          <Row k="Aplicação" v={`${d.app} v${d.version}`} /><Row k="Atualização" v={d.update?.up_to_date ? `✓ Atualizado` : `Disponível ${d.update?.latest}`} />
          <Row k="Base de dados" v={d.database} /><Row k="Python" v={d.python} /><Row k="Django" v={d.django} /><Row k="Plataforma" v={d.platform} /><Row k="Modo debug" v={String(d.debug)} />
        </div>
      )}</div>
    </ClassicWindow>
  );
}

// ==================== Segurança (03) ====================
export function SecDashboardView() {
  const { data: d } = useQuery({ queryKey: ['final', 'securityDashboard'], queryFn: () => finalApi.securityDashboard() });
  return (
    <ClassicWindow title="Segurança — Dashboard" icon={<LayoutDashboard size={14} className="text-gray-300" />} footer={<div className="text-gray-600">Centro 03 · utilizadores, sessões e acessos</div>}>
      <div className="p-3 grid grid-cols-4 gap-2">
        {!d ? <div className="col-span-4 text-center text-gray-400 py-8 text-[12px]">A carregar…</div> : <>
          <Card label="Utilizadores" value={d.users_total} sub={`${d.users_active} ativos`} /><Card label="Staff" value={d.staff} />
          <Card label="Administradores" value={d.superusers} /><Card label="Sessões ativas" value={d.active_sessions} />
          <Card label="Operadores POS" value={d.pos_operators} />
        </>}
      </div>
    </ClassicWindow>
  );
}

function SecurityPolicyEditor({ title, icon, fields }: { title: string; icon: any; fields: Array<{ key: string; label: string; type?: string }> }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['final', 'securityPolicy'], queryFn: () => finalApi.securityPolicy() });
  const [form, setForm] = useState<any>(null);
  const p = form ?? data ?? {};
  const save = useMutation({ mutationFn: (v: any) => finalApi.saveSecurityPolicy(v), onSuccess: () => { qc.invalidateQueries({ queryKey: ['final', 'securityPolicy'] }); alert('Política guardada.'); } });
  return (
    <ClassicWindow title={title} icon={icon} footer={<div className="text-gray-600">Política de segurança global</div>}>
      <div className="p-3 max-w-md space-y-2">
        {fields.map((fl) => (
          <div key={fl.key} className="flex items-center justify-between text-[12px] border-b border-[#eee] py-1.5">
            <span className="text-gray-600">{fl.label}</span>
            {fl.type === 'bool'
              ? <input type="checkbox" checked={!!p[fl.key]} onChange={(e) => setForm({ ...p, [fl.key]: e.target.checked })} />
              : <input type={fl.type || 'number'} value={p[fl.key] ?? ''} onChange={(e) => setForm({ ...p, [fl.key]: fl.type === 'text' ? e.target.value : Number(e.target.value) })} className="border border-[#a0a0a0] p-1 w-32" />}
          </div>
        ))}
        <ClassicButton icon={CheckCircle} label="Guardar política" onClick={() => save.mutate(p)} />
      </div>
    </ClassicWindow>
  );
}
export const SecPinView = () => <SecurityPolicyEditor title="Segurança — Política de PIN" icon={<KeyRound size={14} className="text-gray-300" />} fields={[
  { key: 'pin_min_length', label: 'Comprimento mínimo do PIN' }, { key: 'pin_expiry_days', label: 'Expiração do PIN (dias, 0=nunca)' }, { key: 'pin_lockout_attempts', label: 'Tentativas até bloqueio' },
]} />;
export const SecMfaView = () => <SecurityPolicyEditor title="Segurança — MFA / Autenticação" icon={<Fingerprint size={14} className="text-gray-300" />} fields={[
  { key: 'mfa_enabled', label: 'Ativar MFA', type: 'bool' }, { key: 'mfa_method', label: 'Método (TOTP/SMS)', type: 'text' }, { key: 'session_timeout_mins', label: 'Timeout de sessão (min)' },
]} />;
