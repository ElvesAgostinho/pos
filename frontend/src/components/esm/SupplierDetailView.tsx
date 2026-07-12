import React, { useEffect, useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Building2, Save, ArrowLeft, Plus, Trash2, RefreshCw } from 'lucide-react';
import {
  useSupplier, useEsmCategories, useCreateSupplier, useUpdateSupplier,
  useRecalcPerformance, useCreateContact, useDeleteContact,
  useCreateContract, useDeleteContract, useCreateDocument, useDeleteDocument,
  useCreateCatalogEntry, useDeleteCatalogEntry,
} from '../../hooks/useEsm';
import type { Supplier } from '../../api/esm';

interface Props {
  supplierId: number | null;
  onBack: () => void;
}

type TabId = 'geral' | 'contactos' | 'catalogo' | 'contratos' | 'performance';

const TABS: { id: TabId; label: string }[] = [
  { id: 'geral', label: 'Geral' },
  { id: 'contactos', label: 'Contactos' },
  { id: 'catalogo', label: 'Catálogo & Preços' },
  { id: 'contratos', label: 'Contratos & Documentos' },
  { id: 'performance', label: 'Performance & Qualidade' },
];

const inputCls = 'flex-1 border border-[#a0a0a0] p-1 focus:outline-none bg-white';
const scoreColor = (s: number) => (s >= 80 ? 'text-green-700' : s >= 50 ? 'text-yellow-600' : 'text-red-600');

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center">
    <label className="w-36 font-bold flex-shrink-0">{label}</label>
    {children}
  </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="border border-[#a0a0a0] bg-white p-2">
    <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">{title}</h3>
    {children}
  </div>
);

export default function SupplierDetailView({ supplierId, onBack }: Props) {
  const [currentId, setCurrentId] = useState<number | null>(supplierId);
  const [tab, setTab] = useState<TabId>('geral');

  const { data: supplier } = useSupplier(currentId ?? undefined);
  const { data: categories = [] } = useEsmCategories();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const recalc = useRecalcPerformance();

  const [form, setForm] = useState<Partial<Supplier>>({
    supplier_type: 'COMPANY', status: 'EVALUATION', currency: 'AOA',
    language: 'pt-PT', country: 'Angola', delivery_days: 1, minimum_order_value: 0, category_ids: [],
  });

  useEffect(() => {
    if (supplier) {
      setForm({ ...supplier, category_ids: supplier.categories?.map((c) => c.id!) ?? [] });
    }
  }, [supplier]);

  const set = (patch: Partial<Supplier>) => setForm((f) => ({ ...f, ...patch }));

  const handleSave = () => {
    const payload = { ...form };
    if (currentId) {
      updateSupplier.mutate({ id: currentId, data: payload });
    } else {
      createSupplier.mutate(payload, { onSuccess: (created) => setCurrentId(created.id!) });
    }
  };

  const isNew = !currentId;

  return (
    <ClassicWindow
      title={isNew ? 'Novo Fornecedor' : `Fornecedor: ${supplier?.commercial_name ?? ''}`}
      icon={<Building2 size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={Save} label="Gravar" onClick={handleSave} />
            {!isNew && supplier && (
              <span className="text-[11px] text-gray-600 ml-2">
                Índice de Desempenho:{' '}
                <span className={`font-bold ${scoreColor(supplier.performance_profile?.overall_score ?? 0)}`}>
                  {supplier.performance_profile?.overall_score ?? '—'}/100
                </span>
              </span>
            )}
          </div>
          <ClassicButton icon={ArrowLeft} label="Voltar à Lista" onClick={onBack} />
        </>
      }
    >
      <div className="flex flex-col h-full">
        {/* Barra de Tabs */}
        <div className="flex bg-[#e0e0e0] border-b border-[#a0a0a0] px-2 pt-1 flex-shrink-0">
          {TABS.map((t) => {
            const disabled = isNew && t.id !== 'geral';
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                disabled={disabled}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1 text-[11px] border border-b-0 mr-1 ${
                  active ? 'bg-white border-[#a0a0a0] font-bold text-[#1e3f66]' : 'bg-[#f0f0f0] border-[#c0c0c0] text-gray-600'
                } ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#f8f8f8]'}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto bg-[#f0f0f0] p-4 text-[11px]">
          {tab === 'geral' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Section title="Identificação">
                <div className="grid gap-y-2">
                  <Field label="Código *"><input required value={form.code || ''} onChange={(e) => set({ code: e.target.value })} className={inputCls} /></Field>
                  <Field label="Tipo">
                    <select value={form.supplier_type} onChange={(e) => set({ supplier_type: e.target.value as any })} className={inputCls}>
                      <option value="COMPANY">Empresa</option>
                      <option value="INDIVIDUAL">Pessoa Singular</option>
                      <option value="GROUP">Grupo Empresarial</option>
                    </select>
                  </Field>
                  <Field label="Nome Comercial *"><input required value={form.commercial_name || ''} onChange={(e) => set({ commercial_name: e.target.value })} className={inputCls} /></Field>
                  <Field label="Razão Social"><input value={form.legal_name || ''} onChange={(e) => set({ legal_name: e.target.value })} className={inputCls} /></Field>
                  <Field label="NIF"><input value={form.nif || ''} onChange={(e) => set({ nif: e.target.value })} className={inputCls} /></Field>
                  <Field label="Nº IVA"><input value={form.vat_number || ''} onChange={(e) => set({ vat_number: e.target.value })} className={inputCls} /></Field>
                  <Field label="Website"><input value={form.website || ''} onChange={(e) => set({ website: e.target.value })} className={inputCls} /></Field>
                  <Field label="Estado">
                    <select value={form.status} onChange={(e) => set({ status: e.target.value as any })} className={inputCls}>
                      <option value="EVALUATION">Em Avaliação</option>
                      <option value="ACTIVE">Ativo</option>
                      <option value="BLOCKED">Bloqueado</option>
                    </select>
                  </Field>
                </div>
              </Section>

              <Section title="Localização & Moeda">
                <div className="grid gap-y-2">
                  <Field label="País"><input value={form.country || ''} onChange={(e) => set({ country: e.target.value })} className={inputCls} /></Field>
                  <Field label="Cidade"><input value={form.city || ''} onChange={(e) => set({ city: e.target.value })} className={inputCls} /></Field>
                  <Field label="Zona"><input value={form.zone || ''} onChange={(e) => set({ zone: e.target.value })} className={inputCls} /></Field>
                  <Field label="Morada"><input value={form.address || ''} onChange={(e) => set({ address: e.target.value })} className={inputCls} /></Field>
                  <Field label="Moeda"><input value={form.currency || ''} onChange={(e) => set({ currency: e.target.value })} className={inputCls} /></Field>
                  <Field label="Idioma"><input value={form.language || ''} onChange={(e) => set({ language: e.target.value })} className={inputCls} /></Field>
                </div>
              </Section>

              <Section title="Condições Comerciais">
                <div className="grid gap-y-2">
                  <Field label="Prazo Pagamento"><input value={form.payment_terms || ''} onChange={(e) => set({ payment_terms: e.target.value })} placeholder="Ex: 30 dias" className={inputCls} /></Field>
                  <Field label="Pedido Mínimo"><input type="number" value={form.minimum_order_value ?? 0} onChange={(e) => set({ minimum_order_value: e.target.value })} className={inputCls} /></Field>
                  <Field label="Dias de Entrega"><input type="number" value={form.delivery_days ?? 1} onChange={(e) => set({ delivery_days: Number(e.target.value) })} className={inputCls} /></Field>
                </div>
              </Section>

              <Section title="Categorias de Fornecimento">
                <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
                  {categories.length === 0 && <span className="text-gray-500">Sem categorias registadas.</span>}
                  {categories.map((c) => {
                    const checked = (form.category_ids ?? []).includes(c.id!);
                    return (
                      <label key={c.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const ids = new Set(form.category_ids ?? []);
                            e.target.checked ? ids.add(c.id!) : ids.delete(c.id!);
                            set({ category_ids: Array.from(ids) });
                          }}
                          className="w-3 h-3"
                        />
                        <span>{c.name}</span>
                      </label>
                    );
                  })}
                </div>
              </Section>
            </div>
          )}

          {tab === 'contactos' && currentId && <ContactsTab supplierId={currentId} contacts={supplier?.contacts ?? []} />}
          {tab === 'catalogo' && currentId && <CatalogTab supplierId={currentId} />}
          {tab === 'contratos' && currentId && (
            <ContractsDocsTab supplierId={currentId} contracts={supplier?.contracts ?? []} documents={supplier?.documents ?? []} />
          )}
          {tab === 'performance' && currentId && (
            <PerformanceTab supplier={supplier} onRecalc={() => recalc.mutate(currentId)} recalculating={recalc.isPending} />
          )}
        </div>
      </div>
    </ClassicWindow>
  );
}

/* ---------------- Contactos ---------------- */
function ContactsTab({ supplierId, contacts }: { supplierId: number; contacts: any[] }) {
  const create = useCreateContact();
  const del = useDeleteContact();
  const [draft, setDraft] = useState<any>({ role: 'COMMERCIAL', name: '' });

  const add = () => {
    if (!draft.name) return;
    create.mutate({ ...draft, supplier: supplierId }, { onSuccess: () => setDraft({ role: 'COMMERCIAL', name: '' }) });
  };

  return (
    <Section title="Contactos do Fornecedor">
      <div className="flex flex-wrap items-end gap-2 mb-3 bg-[#f8f8f8] p-2 border border-[#e0e0e0]">
        <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} className="border border-[#a0a0a0] p-1">
          <option value="COMMERCIAL">Comercial</option>
          <option value="PURCHASING">Compras</option>
          <option value="FINANCE">Financeiro</option>
          <option value="LOGISTICS">Logística</option>
          <option value="SUPPORT">Suporte</option>
          <option value="EMERGENCY">Emergência</option>
        </select>
        <input placeholder="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="border border-[#a0a0a0] p-1" />
        <input placeholder="Cargo" value={draft.job_title || ''} onChange={(e) => setDraft({ ...draft, job_title: e.target.value })} className="border border-[#a0a0a0] p-1" />
        <input placeholder="Telefone" value={draft.phone || ''} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
        <input placeholder="Email" value={draft.email || ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className="border border-[#a0a0a0] p-1" />
        <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
      </div>
      <ClassicGrid
        rowKey="id"
        data={contacts}
        columns={[
          { header: 'Função', accessor: 'role', width: '15%' },
          { header: 'Nome', accessor: 'name', width: '25%' },
          { header: 'Cargo', accessor: 'job_title', width: '20%' },
          { header: 'Telefone', accessor: 'phone', width: '15%' },
          { header: 'Email', accessor: 'email', width: '20%' },
          { header: '', accessor: (r: any) => <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '5%' },
        ]}
      />
    </Section>
  );
}

/* ---------------- Catálogo ---------------- */
function CatalogTab({ supplierId }: { supplierId: number }) {
  const { data: supplier } = useSupplier(supplierId);
  const create = useCreateCatalogEntry();
  const del = useDeleteCatalogEntry();
  const [draft, setDraft] = useState<any>({ item: '', agreed_price: '', vat_percentage: 14 });

  const add = () => {
    if (!draft.item || !draft.agreed_price) return;
    create.mutate({ ...draft, item: Number(draft.item), supplier: supplierId }, { onSuccess: () => setDraft({ item: '', agreed_price: '', vat_percentage: 14 }) });
  };

  // O catálogo vem embutido no supplier via serializer? Não — usamos endpoint filho.
  const catalog = (supplier as any)?.catalog ?? [];

  return (
    <Section title="Catálogo de Produtos & Preços Acordados">
      <div className="flex flex-wrap items-end gap-2 mb-3 bg-[#f8f8f8] p-2 border border-[#e0e0e0]">
        <input placeholder="ID do Artigo" value={draft.item} onChange={(e) => setDraft({ ...draft, item: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
        <input placeholder="Cód. do Fornecedor" value={draft.supplier_item_code || ''} onChange={(e) => setDraft({ ...draft, supplier_item_code: e.target.value })} className="border border-[#a0a0a0] p-1" />
        <input placeholder="Preço Acordado" type="number" value={draft.agreed_price} onChange={(e) => setDraft({ ...draft, agreed_price: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
        <input placeholder="IVA %" type="number" value={draft.vat_percentage} onChange={(e) => setDraft({ ...draft, vat_percentage: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
        <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
      </div>
      <ClassicGrid
        rowKey="id"
        data={catalog}
        columns={[
          { header: 'Cód. Artigo', accessor: 'item_code', width: '15%' },
          { header: 'Artigo', accessor: 'item_name', width: '35%' },
          { header: 'Cód. Fornecedor', accessor: 'supplier_item_code', width: '20%' },
          { header: 'Preço', accessor: (r: any) => Number(r.agreed_price).toFixed(2), width: '12%' },
          { header: 'IVA %', accessor: 'vat_percentage', width: '10%' },
          { header: '', accessor: (r: any) => <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '8%' },
        ]}
      />
    </Section>
  );
}

/* ---------------- Contratos & Documentos ---------------- */
function ContractsDocsTab({ supplierId, contracts, documents }: { supplierId: number; contracts: any[]; documents: any[] }) {
  const createContract = useCreateContract();
  const delContract = useDeleteContract();
  const createDoc = useCreateDocument();
  const delDoc = useDeleteDocument();

  const [c, setC] = useState<any>({ reference: '', start_date: '', end_date: '', incoterms: '' });
  const [d, setD] = useState<any>({ document_type: 'CERTIFICATE', title: '', expiration_date: '' });

  return (
    <div className="grid grid-cols-1 gap-4">
      <Section title="Contratos">
        <div className="flex flex-wrap items-end gap-2 mb-3 bg-[#f8f8f8] p-2 border border-[#e0e0e0]">
          <input placeholder="Referência" value={c.reference} onChange={(e) => setC({ ...c, reference: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <label className="text-gray-600">Início <input type="date" value={c.start_date} onChange={(e) => setC({ ...c, start_date: e.target.value })} className="border border-[#a0a0a0] p-1" /></label>
          <label className="text-gray-600">Fim <input type="date" value={c.end_date} onChange={(e) => setC({ ...c, end_date: e.target.value })} className="border border-[#a0a0a0] p-1" /></label>
          <input placeholder="Incoterms" value={c.incoterms} onChange={(e) => setC({ ...c, incoterms: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
          <ClassicButton icon={Plus} label="Adicionar" onClick={() => c.reference && c.start_date && createContract.mutate({ ...c, end_date: c.end_date || null, supplier: supplierId }, { onSuccess: () => setC({ reference: '', start_date: '', end_date: '', incoterms: '' }) })} />
        </div>
        <ClassicGrid
          rowKey="id"
          data={contracts}
          columns={[
            { header: 'Referência', accessor: 'reference', width: '30%' },
            { header: 'Início', accessor: 'start_date', width: '20%' },
            { header: 'Fim', accessor: 'end_date', width: '20%' },
            { header: 'Incoterms', accessor: 'incoterms', width: '20%' },
            { header: '', accessor: (r: any) => <button onClick={() => delContract.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '10%' },
          ]}
        />
      </Section>

      <Section title="Documentos & Certificados (com alertas de validade)">
        <div className="flex flex-wrap items-end gap-2 mb-3 bg-[#f8f8f8] p-2 border border-[#e0e0e0]">
          <select value={d.document_type} onChange={(e) => setD({ ...d, document_type: e.target.value })} className="border border-[#a0a0a0] p-1">
            <option value="CERTIFICATE">Certificado (ISO/HACCP)</option>
            <option value="CONTRACT">Contrato</option>
            <option value="LICENSE">Licença</option>
            <option value="INSURANCE">Seguro</option>
            <option value="PERMIT">Alvará</option>
            <option value="OTHER">Outro</option>
          </select>
          <input placeholder="Título" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <label className="text-gray-600">Validade <input type="date" value={d.expiration_date} onChange={(e) => setD({ ...d, expiration_date: e.target.value })} className="border border-[#a0a0a0] p-1" /></label>
          <ClassicButton icon={Plus} label="Adicionar" onClick={() => d.title && createDoc.mutate({ ...d, expiration_date: d.expiration_date || null, supplier: supplierId }, { onSuccess: () => setD({ document_type: 'CERTIFICATE', title: '', expiration_date: '' }) })} />
        </div>
        <ClassicGrid
          rowKey="id"
          data={documents}
          columns={[
            { header: 'Tipo', accessor: 'document_type', width: '20%' },
            { header: 'Título', accessor: 'title', width: '40%' },
            { header: 'Validade', accessor: (r: any) => {
                if (!r.expiration_date) return '—';
                const exp = new Date(r.expiration_date);
                const soon = (exp.getTime() - Date.now()) / 86400000;
                const cls = soon < 0 ? 'text-red-600 font-bold' : soon < 30 ? 'text-yellow-700 font-bold' : '';
                return <span className={cls}>{r.expiration_date}</span>;
              }, width: '30%' },
            { header: '', accessor: (r: any) => <button onClick={() => delDoc.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '10%' },
          ]}
        />
      </Section>
    </div>
  );
}

/* ---------------- Performance & Qualidade ---------------- */
function PerformanceTab({ supplier, onRecalc, recalculating }: { supplier?: Supplier; onRecalc: () => void; recalculating: boolean }) {
  const p = supplier?.performance_profile;
  const q = supplier?.quality_controls?.[0];

  const Metric = ({ label, value, suffix = '%' }: { label: string; value: any; suffix?: string }) => (
    <div className="bg-white border border-[#c0c0c0] p-3">
      <div className="text-[10px] text-gray-600 mb-1">{label}</div>
      <div className="text-xl font-bold text-[#1e3f66]">{value ?? '—'}{value != null && suffix}</div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4">
      <Section title="Índice de Desempenho do Fornecedor">
        <div className="flex items-center justify-between mb-3">
          <div className={`text-4xl font-bold ${scoreColor(p?.overall_score ?? 0)}`}>{p?.overall_score ?? '—'}<span className="text-lg text-gray-400">/100</span></div>
          <ClassicButton icon={RefreshCw} label="Recalcular a partir das Compras" onClick={onRecalc} disabled={recalculating} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Metric label="Pontualidade" value={p ? Number(p.punctuality_percentage).toFixed(1) : undefined} />
          <Metric label="Entregas Completas" value={p ? Number(p.completeness_percentage).toFixed(1) : undefined} />
          <Metric label="Variância de Preço" value={p ? Number(p.price_variance_percentage).toFixed(1) : undefined} />
          <Metric label="Taxa de Devoluções" value={p ? Number(p.return_rate_percentage).toFixed(1) : undefined} />
          <Metric label="Total de Encomendas" value={p?.total_orders} suffix="" />
          <Metric label="Total de Receções" value={p?.total_grns} suffix="" />
        </div>
      </Section>

      <Section title="Controlo de Qualidade">
        {q ? (
          <div className="grid gap-y-1">
            <div>HACCP obrigatório: <b>{q.requires_haccp ? 'Sim' : 'Não'}</b></div>
            <div>Cadeia de frio: <b>{q.requires_cold_chain ? 'Sim' : 'Não'}</b></div>
            <div>Temperatura exigida: <b>{q.required_temperature || '—'}</b></div>
            <div>Última auditoria: <b>{q.last_audit_date || '—'}</b></div>
            {q.audit_notes && <div className="text-gray-600 mt-1">Notas: {q.audit_notes}</div>}
          </div>
        ) : (
          <div className="text-gray-500">Sem requisitos de qualidade registados para este fornecedor.</div>
        )}
      </Section>
    </div>
  );
}
