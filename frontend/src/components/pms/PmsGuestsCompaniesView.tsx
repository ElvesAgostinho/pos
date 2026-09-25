import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Toolbar } from '../posconfig/kit';
import ClassicGrid from '../ui/ClassicGrid';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';

/** Hóspedes & Empresas — os dois são o MESMO cadastro (mdm.Customer, o mesmo usado
    pela Pesquisa de Entidades do POS): uma Empresa é só um Customer marcado com o
    tipo de entidade "Empresa" (pos.CustomerType). Não se cria nenhum modelo novo —
    só se filtra e simplifica o formulário para o contexto de reserva/faturação do
    PMS (o ecrã completo de Cadastros continua a existir para quem precisar dele). */

const blankGuest = {
  name: '', email: '', phone: '', nationality: '', id_number: '', doc_type: '',
  birth_date: '', address: '', notes: '',
};
const blankCompany = {
  name: '', tax_id: '', email: '', phone: '', address: '', notes: '',
};

const genCode = (prefix: string) => `${prefix}${Date.now().toString(36).toUpperCase()}`;

export default function PmsGuestsCompaniesView() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'guests' | 'companies'>('guests');
  const [selId, setSelId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(blankGuest);
  const [empresaTypeId, setEmpresaTypeId] = useState<number | null>(null);

  // O tipo de entidade "Empresa" pode não existir ainda nesta instalação (é criado
  // à primeira vez que alguém abre este ecrã, não numa migração — mesma disciplina
  // de "cria-se sozinho na primeira utilização" já usada noutros sítios do sistema).
  useEffect(() => {
    (async () => {
      try {
        const r = await apiClient.get('pos/config/customer-types/');
        const list = Array.isArray(r.data) ? r.data : r.data?.results || [];
        const found = list.find((t: any) => (t.code || '').toUpperCase() === 'EMPRESA');
        if (found) { setEmpresaTypeId(found.id); return; }
        const created = await apiClient.post('pos/config/customer-types/', { code: 'EMPRESA', name: 'Empresa', for_pos: true });
        setEmpresaTypeId(created.data.id);
      } catch (e) { notifyError(e); }
    })();
  }, []);

  const { data, refetch } = useQuery({
    queryKey: ['mdm', 'customers', 'pms'],
    queryFn: async () => (await apiClient.get('mdm/customers/')).data,
  });
  const all: any[] = Array.isArray(data) ? data : data?.results || [];
  const rows = all.filter((c) => (tab === 'companies') === (!!empresaTypeId && c.entity_type === empresaTypeId));

  const select = (r: any) => { setSelId(r.id); setForm(r); };
  const novo = () => { setSelId(null); setForm(tab === 'guests' ? blankGuest : blankCompany); };
  const trocarAba = (t: 'guests' | 'companies') => { setTab(t); setSelId(null); setForm(t === 'guests' ? blankGuest : blankCompany); };

  const save = async () => {
    if (!form.name?.trim()) { aviso('O nome é obrigatório.'); return; }
    try {
      const payload = { ...form, entity_type: tab === 'companies' ? empresaTypeId : null };
      if (selId) {
        await apiClient.patch(`mdm/customers/${selId}/`, payload);
      } else {
        await apiClient.post('mdm/customers/', { ...payload, code: genCode(tab === 'companies' ? 'E' : 'H') });
      }
      refetch(); qc.invalidateQueries({ queryKey: ['mdm'] }); novo();
    } catch (e) { notifyError(e); }
  };

  const remove = async () => {
    if (!selId) return;
    if (!confirm(`Eliminar "${form.name}"?`)) return;
    try { await apiClient.delete(`mdm/customers/${selId}/`); refetch(); novo(); } catch (e) { notifyError(e); }
  };

  const inp = 'border border-[#7FA9B1] p-1';

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex border-b border-[#7FA9B1] bg-[#F7FAFA]">
        {(['guests', 'companies'] as const).map((t) => (
          <button key={t} onClick={() => trocarAba(t)}
            className={`px-4 py-2 text-[12px] font-semibold border-r border-[#CFE3E6] ${tab === t ? 'bg-white text-[#062A31] border-b-2 border-b-[#0B4F5C]' : 'text-[#5C8891] hover:bg-white'}`}>
            {t === 'guests' ? 'Hóspedes' : 'Empresas'}
          </button>
        ))}
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r border-[#7FA9B1]">
          <ClassicGrid rowKey="id" data={rows} selectedRowId={selId ?? undefined} onRowClick={select} columns={
            tab === 'guests'
              ? [
                  { header: 'Nome', accessor: 'name', width: '40%' },
                  { header: 'E-mail', accessor: 'email', width: '30%' },
                  { header: 'Telefone', accessor: 'phone', width: '30%' },
                ]
              : [
                  { header: 'Nome', accessor: 'name', width: '40%' },
                  { header: 'NIF', accessor: 'tax_id', width: '25%' },
                  { header: 'Telefone', accessor: 'phone', width: '35%' },
                ]
          } />
        </div>
        <div className="w-1/2 p-3 space-y-2 text-[11px] overflow-auto">
          <label className="flex flex-col">Nome<input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} /></label>
          {tab === 'companies' && (
            <label className="flex flex-col">NIF<input value={form.tax_id || ''} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} className={inp} /></label>
          )}
          <label className="flex flex-col">E-mail<input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inp} /></label>
          <label className="flex flex-col">Telefone<input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inp} /></label>
          {tab === 'guests' && (
            <>
              <label className="flex flex-col">Nacionalidade<input value={form.nationality || ''} onChange={(e) => setForm({ ...form, nationality: e.target.value })} className={inp} /></label>
              <div className="flex gap-2">
                <label className="flex-1 flex flex-col">Tipo de documento<input value={form.doc_type || ''} onChange={(e) => setForm({ ...form, doc_type: e.target.value })} className={inp} /></label>
                <label className="flex-1 flex flex-col">Nº documento<input value={form.id_number || ''} onChange={(e) => setForm({ ...form, id_number: e.target.value })} className={inp} /></label>
              </div>
              <label className="flex flex-col">Data de nascimento<input type="date" value={form.birth_date || ''} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} className={inp} /></label>
            </>
          )}
          <label className="flex flex-col">Morada<input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inp} /></label>
          <label className="flex flex-col">Notas<textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inp} rows={2} /></label>
        </div>
      </div>
      <Toolbar actions={[
        { label: tab === 'guests' ? 'Novo Hóspede' : 'Nova Empresa', icon: '＋', onClick: novo },
        { label: 'Gravar', icon: '💾', onClick: save },
        { label: 'Eliminar', icon: '✕', onClick: remove, disabled: !selId, color: '#B0392B' },
      ]} />
    </div>
  );
}
