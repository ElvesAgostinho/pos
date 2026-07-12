import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { FileText, Plus, Trash2, ShieldCheck, Award, Gauge, ScrollText } from 'lucide-react';
import { esmApi } from '../../api/esm';

const useSuppliers = () => useQuery({ queryKey: ['esm', 'suppliers-lite'], queryFn: () => esmApi.getSuppliers() });
const inval = (qc: any) => qc.invalidateQueries({ queryKey: ['srm'] });

function SupplierSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: sups = [] } = useSuppliers();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="border border-[#a0a0a0] p-1 bg-white max-w-[180px]">
      <option value="">Fornecedor…</option>
      {sups.map((s: any) => <option key={s.id} value={s.id}>{s.commercial_name}</option>)}
    </select>
  );
}

// ---------------- Contratos ----------------
export function SrmContractsView() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({ queryKey: ['srm', 'contracts'], queryFn: () => esmApi.listContracts() });
  const create = useMutation({ mutationFn: (p: any) => esmApi.createContract(p), onSuccess: () => inval(qc) });
  const remove = useMutation({ mutationFn: (id: number) => esmApi.deleteContract(id), onSuccess: () => inval(qc) });
  const [f, setF] = useState<any>({ supplier: '', reference: '', start_date: '', end_date: '', base_discount_percentage: '', incoterms: '' });
  const add = () => {
    if (!f.supplier || !f.reference || !f.start_date) return;
    create.mutate({ ...f, supplier: Number(f.supplier), base_discount_percentage: Number(f.base_discount_percentage) || 0, end_date: f.end_date || null },
      { onSuccess: () => setF({ supplier: '', reference: '', start_date: '', end_date: '', base_discount_percentage: '', incoterms: '' }) });
  };
  return (
    <ClassicWindow title="Contratos de Fornecedores" icon={<ScrollText size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Contratos: {rows.length}</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <SupplierSelect value={f.supplier} onChange={(v) => setF({ ...f, supplier: v })} />
          <input placeholder="Referência" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} className="border border-[#a0a0a0] p-1 w-28" />
          <input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <input type="number" placeholder="Desc.%" value={f.base_discount_percentage} onChange={(e) => setF({ ...f, base_discount_percentage: e.target.value })} className="border border-[#a0a0a0] p-1 w-16" />
          <input placeholder="Incoterms" value={f.incoterms} onChange={(e) => setF({ ...f, incoterms: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Referência', accessor: 'reference', width: '18%' },
            { header: 'Fornecedor', accessor: 'supplier_name', width: '28%' },
            { header: 'Início', accessor: 'start_date', width: '14%' },
            { header: 'Fim', accessor: (r: any) => r.end_date || '—', width: '14%' },
            { header: 'Desc.', accessor: (r: any) => `${r.base_discount_percentage}%`, width: '10%' },
            { header: 'Incoterms', accessor: (r: any) => r.incoterms || '—', width: '10%' },
            { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '6%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

// ---------------- Documentos / Certificados ----------------
const DOC_TYPES: Record<string, string> = { CONTRACT: 'Contrato', LICENSE: 'Licença', CERTIFICATE: 'Certificado', INSURANCE: 'Seguro', PERMIT: 'Alvará', OTHER: 'Outro' };

function DocumentsBase({ title, icon, onlyType }: { title: string; icon: any; onlyType?: string }) {
  const qc = useQueryClient();
  const { data: all = [] } = useQuery({ queryKey: ['srm', 'documents'], queryFn: () => esmApi.listDocuments() });
  const rows = onlyType ? all.filter((d: any) => d.document_type === onlyType) : all;
  const create = useMutation({ mutationFn: (p: any) => esmApi.createDocument(p), onSuccess: () => inval(qc) });
  const remove = useMutation({ mutationFn: (id: number) => esmApi.deleteDocument(id), onSuccess: () => inval(qc) });
  const [f, setF] = useState<any>({ supplier: '', document_type: onlyType || 'OTHER', title: '', issue_date: '', expiration_date: '' });
  const today = new Date().toISOString().slice(0, 10);
  const add = () => {
    if (!f.supplier || !f.title) return;
    create.mutate({ ...f, supplier: Number(f.supplier), issue_date: f.issue_date || null, expiration_date: f.expiration_date || null },
      { onSuccess: () => setF({ supplier: '', document_type: onlyType || 'OTHER', title: '', issue_date: '', expiration_date: '' }) });
  };
  return (
    <ClassicWindow title={title} icon={icon} footer={<div className="text-gray-600">{rows.length} documento(s)</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <SupplierSelect value={f.supplier} onChange={(v) => setF({ ...f, supplier: v })} />
          {!onlyType && (
            <select value={f.document_type} onChange={(e) => setF({ ...f, document_type: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
              {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
          <input placeholder="Título" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="border border-[#a0a0a0] p-1" />
          <label className="text-gray-500">Emissão<input type="date" value={f.issue_date} onChange={(e) => setF({ ...f, issue_date: e.target.value })} className="border border-[#a0a0a0] p-1 ml-1" /></label>
          <label className="text-gray-500">Validade<input type="date" value={f.expiration_date} onChange={(e) => setF({ ...f, expiration_date: e.target.value })} className="border border-[#a0a0a0] p-1 ml-1" /></label>
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Título', accessor: 'title', width: '30%' },
            { header: 'Fornecedor', accessor: 'supplier_name', width: '26%' },
            ...(onlyType ? [] : [{ header: 'Tipo', accessor: (r: any) => r.document_type_display, width: '14%' }]),
            { header: 'Emissão', accessor: (r: any) => r.issue_date || '—', width: onlyType ? '18%' : '12%' },
            { header: 'Validade', accessor: (r: any) => <span className={r.expiration_date && r.expiration_date < today ? 'text-red-600 font-bold' : ''}>{r.expiration_date || '—'}</span>, width: onlyType ? '20%' : '12%' },
            { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '6%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}
export const SrmDocumentsView = () => <DocumentsBase title="Documentos de Fornecedores" icon={<FileText size={14} className="text-gray-300" />} />;
export const SrmCertificatesView = () => <DocumentsBase title="Certificados (ISO / HACCP)" icon={<Award size={14} className="text-gray-300" />} onlyType="CERTIFICATE" />;

// ---------------- SLA / Controlo de Qualidade ----------------
export function SrmSlaView() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({ queryKey: ['srm', 'quality'], queryFn: () => esmApi.listQuality() });
  const create = useMutation({ mutationFn: (p: any) => esmApi.createQuality(p), onSuccess: () => inval(qc) });
  const remove = useMutation({ mutationFn: (id: number) => esmApi.deleteQuality(id), onSuccess: () => inval(qc) });
  const [f, setF] = useState<any>({ supplier: '', requires_haccp: false, requires_cold_chain: false, required_temperature: '', last_audit_date: '' });
  const add = () => {
    if (!f.supplier) return;
    create.mutate({ ...f, supplier: Number(f.supplier), last_audit_date: f.last_audit_date || null },
      { onSuccess: () => setF({ supplier: '', requires_haccp: false, requires_cold_chain: false, required_temperature: '', last_audit_date: '' }) });
  };
  return (
    <ClassicWindow title="SLA & Controlo de Qualidade" icon={<ShieldCheck size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Requisitos: {rows.length}</div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <SupplierSelect value={f.supplier} onChange={(v) => setF({ ...f, supplier: v })} />
          <label className="flex items-center gap-1"><input type="checkbox" checked={f.requires_haccp} onChange={(e) => setF({ ...f, requires_haccp: e.target.checked })} />HACCP</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={f.requires_cold_chain} onChange={(e) => setF({ ...f, requires_cold_chain: e.target.checked })} />Cadeia de frio</label>
          <input placeholder="Temp. exigida" value={f.required_temperature} onChange={(e) => setF({ ...f, required_temperature: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
          <label className="text-gray-500">Última auditoria<input type="date" value={f.last_audit_date} onChange={(e) => setF({ ...f, last_audit_date: e.target.value })} className="border border-[#a0a0a0] p-1 ml-1" /></label>
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={rows} columns={[
            { header: 'Fornecedor', accessor: 'supplier_name', width: '34%' },
            { header: 'HACCP', accessor: (r: any) => r.requires_haccp ? '✓' : '—', width: '12%' },
            { header: 'Cadeia frio', accessor: (r: any) => r.requires_cold_chain ? '✓' : '—', width: '14%' },
            { header: 'Temp.', accessor: (r: any) => r.required_temperature || '—', width: '14%' },
            { header: 'Últ. auditoria', accessor: (r: any) => r.last_audit_date || '—', width: '18%' },
            { header: '', accessor: (r: any) => <button onClick={() => remove.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '8%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

// ---------------- Avaliações / Performance ----------------
export function SrmEvaluationView() {
  const { data: rows = [] } = useQuery({ queryKey: ['srm', 'performance'], queryFn: () => esmApi.listPerformance() });
  const tone = (s: number) => s >= 85 ? 'text-green-700 font-bold' : s >= 60 ? 'text-amber-700 font-bold' : 'text-red-600 font-bold';
  return (
    <ClassicWindow title="Avaliação de Fornecedores (Scorecard)" icon={<Gauge size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Avaliados: {rows.length} · pontualidade, conformidade e devoluções</div>}>
      <div className="p-2 h-full">
        <ClassicGrid rowKey="id" data={rows} columns={[
          { header: 'Fornecedor', accessor: 'supplier_name', width: '26%' },
          { header: 'Score', accessor: (r: any) => <span className={tone(r.overall_score)}>{r.overall_score}/100</span>, width: '12%' },
          { header: 'Pontualidade', accessor: (r: any) => `${r.punctuality_percentage}%`, width: '14%' },
          { header: 'Conformidade', accessor: (r: any) => `${r.completeness_percentage}%`, width: '14%' },
          { header: 'Devoluções', accessor: (r: any) => `${r.return_rate_percentage}%`, width: '12%' },
          { header: 'Encomendas', accessor: 'total_orders', width: '11%' },
          { header: 'Receções', accessor: 'total_grns', width: '11%' },
        ]} />
        {rows.length === 0 && <div className="text-center text-gray-400 text-[12px] py-8">Sem perfis de performance. Recalcule a partir da ficha do fornecedor.</div>}
      </div>
    </ClassicWindow>
  );
}
