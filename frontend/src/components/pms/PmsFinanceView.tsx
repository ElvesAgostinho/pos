import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Toolbar } from '../posconfig/kit';
import ClassicGrid from '../ui/ClassicGrid';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';

/** Financeiro simples (Receitas/Despesas) do PMS — sobre o motor de tesouraria REAL
    já existente (finance.Receipt/PaymentVoucher/CostCenter), não um livro paralelo.
    Uma Receita é um finance.Receipt, uma Despesa é um finance.PaymentVoucher, e a
    "Categoria" é um finance.CostCenter — só a apresentação é simplificada (uma
    tabela só, um formulário só), os dados são os mesmos que Tesouraria usa. */

const METHODS = ['CASH', 'CARD', 'TRANSFER', 'MB_WAY', 'OTHER'];
const METHOD_LABEL: Record<string, string> = { CASH: 'Dinheiro', CARD: 'Cartão', TRANSFER: 'Transferência', MB_WAY: 'MB Way', OTHER: 'Outro' };
const NEW_CAT = '__nova__';

const blank = { kind: 'income', name: '', amount: '', method: 'CASH', date: new Date().toISOString().slice(0, 10), cost_center: '' };

export default function PmsFinanceView() {
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(blank);
  const [novaCategoria, setNovaCategoria] = useState('');

  // A conta de tesouraria que recebe estes lançamentos — criada sozinha na
  // primeira utilização (mesmo princípio do tipo de entidade "Empresa" acima).
  // O operador do PMS nunca escolhe conta bancária: só vê Receita/Despesa.
  useEffect(() => {
    (async () => {
      try {
        const r = await apiClient.get('finance/accounts/');
        const list = Array.isArray(r.data) ? r.data : r.data?.results || [];
        const found = list.find((a: any) => (a.code || '').toUpperCase() === 'PMS');
        if (found) { setAccountId(found.id); return; }
        const created = await apiClient.post('finance/accounts/', { code: 'PMS', name: 'Caixa PMS', account_type: 'CASH', currency: 'AOA', opening_balance: 0 });
        setAccountId(created.data.id);
      } catch (e) { notifyError(e); }
    })();
  }, []);

  const { data: cats, refetch: refetchCats } = useQuery({
    queryKey: ['finance', 'cost-centers'],
    queryFn: async () => (await apiClient.get('finance/cost-centers/')).data,
  });
  const categories: any[] = Array.isArray(cats) ? cats : cats?.results || [];

  const { data: receipts, refetch: refetchReceipts } = useQuery({
    queryKey: ['finance', 'receipts', 'pms'],
    queryFn: async () => (await apiClient.get('finance/receipts/')).data,
  });
  const { data: payments, refetch: refetchPayments } = useQuery({
    queryKey: ['finance', 'payments', 'pms'],
    queryFn: async () => (await apiClient.get('finance/payments/')).data,
  });
  const receiptRows: any[] = (Array.isArray(receipts) ? receipts : receipts?.results || []).map((r: any) => ({ ...r, kind: 'income' }));
  const paymentRows: any[] = (Array.isArray(payments) ? payments : payments?.results || []).map((p: any) => ({ ...p, kind: 'expense' }));
  const rows = [...receiptRows, ...paymentRows].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const totalIncome = receiptRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalExpense = paymentRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const money = (n: number) => `Kz ${n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const novo = () => { setForm(blank); setNovaCategoria(''); };

  const save = async () => {
    if (!form.name?.trim()) { aviso('O nome é obrigatório.'); return; }
    if (!form.amount || Number(form.amount) <= 0) { aviso('O valor tem de ser maior que zero.'); return; }
    if (!accountId) { aviso('A conta de tesouraria ainda está a ser preparada — tente novamente em instantes.'); return; }
    try {
      let costCenterId: number | null = form.cost_center && form.cost_center !== NEW_CAT ? Number(form.cost_center) : null;
      if (form.cost_center === NEW_CAT && novaCategoria.trim()) {
        const created = await apiClient.post('finance/cost-centers/', { code: genCatCode(novaCategoria), name: novaCategoria.trim() });
        costCenterId = created.data.id;
        refetchCats();
      }
      const payload: any = {
        account: accountId, party_name: form.name.trim(), description: form.name.trim(),
        amount: form.amount, method: form.method, date: form.date,
      };
      if (form.kind === 'expense') payload.cost_center = costCenterId;
      if (form.kind === 'income') await apiClient.post('finance/receipts/', payload);
      else await apiClient.post('finance/payments/', payload);
      refetchReceipts(); refetchPayments(); qc.invalidateQueries({ queryKey: ['finance'] }); novo();
    } catch (e) { notifyError(e); }
  };

  const inp = 'border border-[#7FA9B1] p-1';

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex gap-3 p-3 bg-[#F7FAFA] border-b border-[#CFE3E6] text-[12px]">
        <div className="bg-white border border-[#7FA9B1] px-3 py-1.5 flex-1"><div className="text-[10px] text-gray-500">Total Receitas</div><div className="font-bold text-[#062A31]">{money(totalIncome)}</div></div>
        <div className="bg-white border border-[#7FA9B1] px-3 py-1.5 flex-1"><div className="text-[10px] text-gray-500">Total Despesas</div><div className="font-bold text-[#B0392B]">{money(totalExpense)}</div></div>
        <div className="bg-white border border-[#7FA9B1] px-3 py-1.5 flex-1"><div className="text-[10px] text-gray-500">Saldo</div><div className="font-bold text-[#062A31]">{money(totalIncome - totalExpense)}</div></div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-3/5 border-r border-[#7FA9B1]">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Nome / Origem', accessor: 'party_name', width: '30%' },
            { header: 'Categoria', accessor: (r: any) => categories.find((c) => c.id === r.cost_center)?.name || '—', width: '20%' },
            { header: 'Método', accessor: (r: any) => METHOD_LABEL[r.method] || r.method, width: '18%' },
            { header: 'Data', accessor: 'date', width: '14%' },
            { header: 'Valor', accessor: (r: any) => <span className={r.kind === 'expense' ? 'text-[#B0392B]' : 'text-[#062A31]'}>{r.kind === 'expense' ? '-' : '+'}{money(Number(r.amount))}</span>, width: '18%' },
          ]} />
        </div>
        <div className="w-2/5 p-3 space-y-2 text-[11px] overflow-auto">
          <div className="font-bold text-[#062A31]">Nova Transação</div>
          <label className="flex flex-col">Tipo
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={inp}>
              <option value="income">Receita</option>
              <option value="expense">Despesa</option>
            </select>
          </label>
          <label className="flex flex-col">Nome<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} /></label>
          <div className="flex gap-2">
            <label className="flex-1 flex flex-col">Valor (Kz)<input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inp} /></label>
            <label className="flex-1 flex flex-col">Método
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className={inp}>
                {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
              </select>
            </label>
          </div>
          {form.kind === 'expense' && (
            <label className="flex flex-col">Categoria
              <select value={form.cost_center} onChange={(e) => setForm({ ...form, cost_center: e.target.value })} className={inp}>
                <option value="">— sem categoria —</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value={NEW_CAT}>+ Nova categoria…</option>
              </select>
            </label>
          )}
          {form.kind === 'expense' && form.cost_center === NEW_CAT && (
            <label className="flex flex-col">Nome da nova categoria<input value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} className={inp} /></label>
          )}
          <label className="flex flex-col">Data<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inp} /></label>
        </div>
      </div>
      <Toolbar actions={[
        { label: 'Limpar', icon: '✕', onClick: novo },
        { label: 'Gravar Transação', icon: '💾', onClick: save },
      ]} />
    </div>
  );
}

const genCatCode = (name: string) => (name.trim().slice(0, 16).toUpperCase().replace(/[^A-Z0-9]+/g, '_') || 'CAT') + '_' + Date.now().toString(36).toUpperCase().slice(-4);
