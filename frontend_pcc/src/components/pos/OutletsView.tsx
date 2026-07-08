import React, { useState } from 'react';
import { useOutlets, useCreateOutlet, useUpdateOutlet, useDeleteOutlet } from '../../hooks/usePos';
import { Settings, Plus, Edit, Trash2, Save } from 'lucide-react';
import type { Outlet } from '../../api/pos';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';

export default function OutletsView() {
  const { data: outlets, isLoading } = useOutlets();
  const createOutlet = useCreateOutlet();
  const updateOutlet = useUpdateOutlet();
  const deleteOutlet = useDeleteOutlet();

  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [selectedItem, setSelectedItem] = useState<Outlet | null>(null);

  const [formData, setFormData] = useState<Partial<Outlet>>({
    code: '', name: '', description: '', is_active: true
  });

  const handleAddClick = () => {
    setSelectedItem(null);
    setFormData({ code: '', name: '', description: '', is_active: true });
    setMode('edit');
  };

  const handleEditClick = (item: Outlet) => {
    setSelectedItem(item);
    setFormData(item);
    setMode('edit');
  };

  const handleDeleteClick = (item: Outlet) => {
    if (confirm(`Tem a certeza que deseja apagar o outlet ${item.name}?`)) {
      if (item.id) deleteOutlet.mutate(item.id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItem?.id) {
      updateOutlet.mutate({ id: selectedItem.id, data: formData }, {
        onSuccess: () => setMode('list')
      });
    } else {
      createOutlet.mutate(formData, {
        onSuccess: () => setMode('list')
      });
    }
  };

  if (mode === 'edit') {
    return (
      <ClassicWindow 
        title={selectedItem ? "Editar Outlet" : "Novo Outlet"}
        icon={<Settings size={14} className="text-gray-300" />}
        footer={
          <>
            <div className="flex items-center space-x-2">
              <ClassicButton icon={Save} label="Gravar Outlet" onClick={handleSubmit as any} />
            </div>
            <div className="flex items-center">
               <ClassicButton label="Cancelar" onClick={() => setMode('list')} />
            </div>
          </>
        }
      >
        <div className="p-4 bg-[#f0f0f0] h-full overflow-y-auto">
          <form id="outlet-form" onSubmit={handleSubmit} className="text-[11px] grid grid-cols-1 gap-4">
            
            <div className="border border-[#a0a0a0] bg-white p-2">
              <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Identificação</h3>
              <div className="grid grid-cols-1 gap-y-2 max-w-md">
                <div className="flex items-center">
                  <label className="w-32 font-bold">Código</label>
                  <input required name="code" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Nome</label>
                  <input required name="name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Descrição</label>
                  <input name="description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center mt-2">
                  <label className="w-32"></label>
                  <label className="flex items-center space-x-1 font-bold">
                    <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} className="w-3 h-3" />
                    <span>Ativo</span>
                  </label>
                </div>
              </div>
            </div>

          </form>
        </div>
      </ClassicWindow>
    );
  }

  const columns = [
    { header: 'Código', accessor: 'code', width: '20%' },
    { header: 'Nome do Outlet', accessor: 'name', width: '30%' },
    { header: 'Descrição', accessor: 'description', width: '30%' },
    { header: 'Estado', accessor: (r: any) => r.is_active ? 'Sim' : 'Não', width: '10%' },
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
      title="Gestão de Outlets"
      icon={<Settings size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={Plus} label="Adicionar Outlet" onClick={handleAddClick} />
          </div>
          <div className="text-gray-600">
            Nº registos a visualizar: {outlets?.length || 0}
          </div>
        </>
      }
    >
      <ClassicGrid 
        columns={columns} 
        data={outlets || []} 
        onRowClick={(row) => handleEditClick(row)}
      />
    </ClassicWindow>
  );
}
