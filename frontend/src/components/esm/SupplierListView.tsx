import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Building2, Plus, Trash2, Search } from 'lucide-react';
import { useSuppliers, useDeleteSupplier } from '../../hooks/useEsm';
import type { Supplier } from '../../api/esm';
import SupplierDetailView from './SupplierDetailView';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativo', BLOCKED: 'Bloqueado', EVALUATION: 'Em Avaliação',
};
const STATUS_CLS: Record<string, string> = {
  ACTIVE: 'text-green-700', BLOCKED: 'text-red-600', EVALUATION: 'text-yellow-700',
};
const scoreColor = (s: number) => (s >= 80 ? 'text-green-700' : s >= 50 ? 'text-yellow-600' : 'text-red-600');

export default function SupplierListView() {
  const [mode, setMode] = useState<'list' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data: suppliers = [], isLoading } = useSuppliers({
    status: statusFilter || undefined,
    search: search || undefined,
  });
  const deleteSupplier = useDeleteSupplier();

  const openDetail = (id: number | null) => { setSelectedId(id); setMode('detail'); };

  if (mode === 'detail') {
    return <SupplierDetailView supplierId={selectedId} onBack={() => setMode('list')} />;
  }

  const columns = [
    { header: 'Código', accessor: 'code', width: '10%' },
    { header: 'Nome Comercial', accessor: 'commercial_name', width: '28%' },
    { header: 'NIF', accessor: (r: Supplier) => r.nif || '—', width: '12%' },
    { header: 'País', accessor: (r: Supplier) => r.country || '—', width: '12%' },
    {
      header: 'Estado',
      accessor: (r: Supplier) => <span className={STATUS_CLS[r.status] || ''}>{STATUS_LABELS[r.status] || r.status}</span>,
      width: '13%',
    },
    {
      header: 'Desempenho',
      accessor: (r: Supplier) => {
        const s = r.performance_profile?.overall_score;
        return s != null ? <span className={`font-bold ${scoreColor(s)}`}>{s}/100</span> : '—';
      },
      width: '13%',
    },
    {
      header: 'Ações',
      accessor: (r: Supplier) => (
        <button
          onClick={(e) => { e.stopPropagation(); if (confirm(`Apagar o fornecedor ${r.commercial_name}?`)) deleteSupplier.mutate(r.id!); }}
          className="text-red-600 hover:text-red-800"
        >
          <Trash2 size={12} />
        </button>
      ),
      width: '7%',
    },
  ];

  return (
    <ClassicWindow
      title="Fornecedores (ESM)"
      icon={<Building2 size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={Plus} label="Novo Fornecedor" onClick={() => openDetail(null)} />
          </div>
          <div className="text-gray-600">Nº registos: {suppliers.length}</div>
        </>
      }
    >
      <div className="flex flex-col h-full">
        {/* Barra de filtros */}
        <div className="flex items-center gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px] flex-shrink-0">
          <div className="flex items-center border border-[#a0a0a0] bg-white px-1">
            <Search size={12} className="text-gray-500" />
            <input
              placeholder="Pesquisar código, nome, NIF…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="p-1 focus:outline-none w-64"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-[#a0a0a0] p-1 bg-white">
            <option value="">Todos os estados</option>
            <option value="ACTIVE">Ativos</option>
            <option value="EVALUATION">Em Avaliação</option>
            <option value="BLOCKED">Bloqueados</option>
          </select>
          {isLoading && <span className="text-gray-500">A carregar…</span>}
        </div>

        <div className="flex-1 overflow-hidden">
          <ClassicGrid columns={columns} data={suppliers} rowKey="id" onRowClick={(row) => openDetail(row.id)} />
        </div>
      </div>
    </ClassicWindow>
  );
}
