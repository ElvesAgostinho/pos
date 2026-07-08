import React, { useState } from 'react';
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '../../hooks/useMdm';
import { Settings, Plus, Trash2, Save } from 'lucide-react';
import type { Category } from '../../api/mdm';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';

export default function CategoriesView() {
  const { data: categories, isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const [formData, setFormData] = useState<Partial<Category>>({
    name: '', description: '', parent: null
  });

  const handleAddClick = () => {
    setSelectedCategory(null);
    setFormData({ name: '', description: '', parent: null });
    setMode('edit');
  };

  const handleEditClick = (item: Category) => {
    setSelectedCategory(item);
    setFormData(item);
    setMode('edit');
  };

  const handleDeleteClick = (item: Category) => {
    if (confirm(`Tem a certeza que deseja apagar a categoria ${item.name}?`)) {
      if (item.id) deleteCategory.mutate(item.id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCategory?.id) {
      updateCategory.mutate({ id: selectedCategory.id, data: formData }, {
        onSuccess: () => setMode('list')
      });
    } else {
      createCategory.mutate(formData, {
        onSuccess: () => setMode('list')
      });
    }
  };

  if (mode === 'edit') {
    return (
      <ClassicWindow 
        title={selectedCategory ? "Editar Categoria" : "Nova Categoria"}
        icon={<Settings size={14} className="text-gray-300" />}
        footer={
          <>
            <div className="flex items-center space-x-2">
              <ClassicButton icon={Save} label="Gravar Categoria" onClick={handleSubmit as any} />
            </div>
            <div className="flex items-center">
               <ClassicButton label="Cancelar" onClick={() => setMode('list')} />
            </div>
          </>
        }
      >
        <div className="p-4 bg-[#f0f0f0] h-full overflow-y-auto">
          <form id="category-form" onSubmit={handleSubmit} className="text-[11px] grid grid-cols-1 gap-4">
            
            <div className="border border-[#a0a0a0] bg-white p-2">
              <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Detalhes da Categoria</h3>
              <div className="grid grid-cols-1 gap-y-2 max-w-md">
                <div className="flex items-center">
                  <label className="w-32 font-bold">Nome *</label>
                  <input required name="name" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Descrição</label>
                  <input name="description" value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Categoria Pai</label>
                  <select name="parent" value={formData.parent || ''} onChange={e => setFormData({...formData, parent: e.target.value || null})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none">
                    <option value="">Nenhuma (Principal)</option>
                    {categories?.filter(c => c.id !== selectedCategory?.id).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

          </form>
        </div>
      </ClassicWindow>
    );
  }

  const columns = [
    { header: 'Nome da Categoria', accessor: 'name', width: '30%' },
    { header: 'Descrição', accessor: 'description', width: '40%' },
    { 
      header: 'Categoria Pai', 
      accessor: (r: any) => {
        if (!r.parent) return '-';
        const parentCat = categories?.find(c => c.id === r.parent);
        return parentCat ? parentCat.name : r.parent;
      }, 
      width: '20%' 
    },
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
      title="Categorias"
      icon={<Settings size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={Plus} label="Adicionar Categoria" onClick={handleAddClick} />
          </div>
          <div className="text-gray-600">
            Nº registos a visualizar: {categories?.length || 0}
          </div>
        </>
      }
    >
      <ClassicGrid 
        columns={columns} 
        data={categories || []} 
        onRowClick={(row) => handleEditClick(row)}
      />
    </ClassicWindow>
  );
}
