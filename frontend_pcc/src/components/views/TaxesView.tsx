import React, { useState } from 'react';
import { useTaxes, useCreateTax, useUpdateTax, useDeleteTax } from '../../hooks/useMdm';
import { Settings, Plus, Trash2, Save } from 'lucide-react';
import type { Tax } from '../../api/mdm';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';

export default function TaxesView() {
  const { data: taxes, isLoading } = useTaxes();
  const createTax = useCreateTax();
  const updateTax = useUpdateTax();
  const deleteTax = useDeleteTax();

  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [selectedTax, setSelectedTax] = useState<Tax | null>(null);

  const [formData, setFormData] = useState<Partial<Tax>>({
    code: '', name: '', percentage: ''
  });

  const handleAddClick = () => {
    setSelectedTax(null);
    setFormData({ code: '', name: '', percentage: '' });
    setMode('edit');
  };

  const handleEditClick = (item: Tax) => {
    setSelectedTax(item);
    setFormData(item);
    setMode('edit');
  };

  const handleDeleteClick = (item: Tax) => {
    if (confirm(`Tem a certeza que deseja apagar o imposto ${item.code}?`)) {
      if (item.id) deleteTax.mutate(item.id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTax?.id) {
      updateTax.mutate({ id: selectedTax.id, data: formData }, {
        onSuccess: () => setMode('list')
      });
    } else {
      createTax.mutate(formData, {
        onSuccess: () => setMode('list')
      });
    }
  };

  if (mode === 'edit') {
    return (
      <ClassicWindow 
        title={selectedTax ? "Editar Imposto" : "Novo Imposto"}
        icon={<Settings size={14} className="text-gray-300" />}
        footer={
          <>
            <div className="flex items-center space-x-2">
              <ClassicButton icon={Save} label="Gravar Imposto" onClick={handleSubmit as any} />
            </div>
            <div className="flex items-center">
               <ClassicButton label="Cancelar" onClick={() => setMode('list')} />
            </div>
          </>
        }
      >
        <div className="p-4 bg-[#f0f0f0] h-full overflow-y-auto">
          <form id="tax-form" onSubmit={handleSubmit} className="text-[11px] grid grid-cols-1 gap-4">
            
            <div className="border border-[#a0a0a0] bg-white p-2">
              <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Detalhes do Imposto</h3>
              <div className="grid grid-cols-1 gap-y-2 max-w-md">
                <div className="flex items-center">
                  <label className="w-32 font-bold">Código *</label>
                  <input required name="code" value={formData.code || ''} onChange={e => setFormData({...formData, code: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Nome / Descrição *</label>
                  <input required name="name" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Taxa (%) *</label>
                  <input required type="number" step="0.01" name="percentage" value={formData.percentage || ''} onChange={e => setFormData({...formData, percentage: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none bg-[#ffffe0]" />
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
    { header: 'Nome / Descrição', accessor: 'name', width: '50%' },
    { header: 'Taxa (%)', accessor: 'percentage', width: '20%' },
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
      title="Gestão de Impostos"
      icon={<Settings size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={Plus} label="Adicionar Imposto" onClick={handleAddClick} />
          </div>
          <div className="text-gray-600">
            Nº registos a visualizar: {taxes?.length || 0}
          </div>
        </>
      }
    >
      <ClassicGrid 
        columns={columns} 
        data={taxes || []} 
        onRowClick={(row) => handleEditClick(row)}
      />
    </ClassicWindow>
  );
}
