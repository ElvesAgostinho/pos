import React, { useState } from 'react';
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier } from '../../hooks/useMdm';
import { Settings, Plus, Trash2, Save } from 'lucide-react';
import type { Supplier } from '../../api/mdm';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';

export default function SuppliersView() {
  const { data: suppliers, isLoading } = useSuppliers();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deleteSupplier = useDeleteSupplier();

  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  const [formData, setFormData] = useState<Partial<Supplier>>({
    name: ''
  });

  const handleAddClick = () => {
    setSelectedSupplier(null);
    setFormData({ name: '' });
    setMode('edit');
  };

  const handleEditClick = (item: Supplier) => {
    setSelectedSupplier(item);
    setFormData(item);
    setMode('edit');
  };

  const handleDeleteClick = (item: Supplier) => {
    if (confirm(`Tem a certeza que deseja apagar o fornecedor ${item.name}?`)) {
      if (item.id) deleteSupplier.mutate(item.id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSupplier?.id) {
      updateSupplier.mutate({ id: selectedSupplier.id, data: formData }, {
        onSuccess: () => setMode('list')
      });
    } else {
      createSupplier.mutate(formData, {
        onSuccess: () => setMode('list')
      });
    }
  };

  if (mode === 'edit') {
    return (
      <ClassicWindow 
        title={selectedSupplier ? "Editar Fornecedor" : "Novo Fornecedor"}
        icon={<Settings size={14} className="text-gray-300" />}
        footer={
          <>
            <div className="flex items-center space-x-2">
              <ClassicButton icon={Save} label="Gravar Fornecedor" onClick={handleSubmit as any} />
            </div>
            <div className="flex items-center">
               <ClassicButton label="Cancelar" onClick={() => setMode('list')} />
            </div>
          </>
        }
      >
        <div className="p-4 bg-[#f0f0f0] h-full overflow-y-auto">
          <form id="supplier-form" onSubmit={handleSubmit} className="text-[11px] grid grid-cols-1 gap-4">
            
            <div className="border border-[#a0a0a0] bg-white p-2">
              <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Detalhes do Fornecedor</h3>
              <div className="grid grid-cols-1 gap-y-2 max-w-md">
                <div className="flex items-center">
                  <label className="w-32 font-bold">Nome *</label>
                  <input required name="name" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
              </div>
            </div>

          </form>
        </div>
      </ClassicWindow>
    );
  }

  const columns = [
    { header: 'Nome do Fornecedor', accessor: 'name', width: '90%' },
    { 
      header: 'Ações', 
      accessor: (r: any) => (
        <div className="flex space-x-2">
          <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(r); }} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>
        </div>
      ), 
      width: '10%' 
    },
  ];

  return (
    <ClassicWindow 
      title="Gestão de Fornecedores"
      icon={<Settings size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={Plus} label="Adicionar Fornecedor" onClick={handleAddClick} />
          </div>
          <div className="text-gray-600">
            Nº registos a visualizar: {suppliers?.length || 0}
          </div>
        </>
      }
    >
      <ClassicGrid 
        columns={columns} 
        data={suppliers || []} 
        onRowClick={(row) => handleEditClick(row)}
      />
    </ClassicWindow>
  );
}
