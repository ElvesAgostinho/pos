import React, { useState, useEffect } from 'react';
import type { Category } from '../../api/mdm';
import { useCategories } from '../../hooks/useMdm';
import { Save, XCircle } from 'lucide-react';

interface CategoryFormProps {
  initialData?: Category | null;
  onSubmit: (data: Partial<Category>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function CategoryForm({ initialData, onSubmit, onCancel, isLoading }: CategoryFormProps) {
  const { data: categories } = useCategories();
  
  const [formData, setFormData] = useState<Partial<Category>>({
    name: '',
    description: '',
    parent: null,
  });

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value === '' ? null : value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="flex flex-col h-full bg-[#f0f0f0]">
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="bg-white p-4 border border-[#d0d0d0] shadow-sm mb-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            
            {/* Left Column */}
            <div className="space-y-4">
              <div className="flex flex-col">
                <label className="text-[11px] font-semibold text-[#333] mb-1">Nome da Categoria *</label>
                <input 
                  type="text" 
                  name="name"
                  value={formData.name || ''}
                  onChange={handleChange}
                  className="border border-[#a0a0a0] px-2 py-1 text-[11px] focus:outline-none focus:border-blue-500 bg-white"
                  placeholder="Ex: Bebidas"
                  required
                />
              </div>

              <div className="flex flex-col">
                <label className="text-[11px] font-semibold text-[#333] mb-1">Categoria Pai</label>
                <select 
                  name="parent"
                  value={formData.parent || ''}
                  onChange={handleChange}
                  className="border border-[#a0a0a0] px-2 py-1 text-[11px] focus:outline-none focus:border-blue-500 bg-white"
                >
                  <option value="">Nenhuma (Categoria Principal)</option>
                  {categories?.filter(c => c.id !== initialData?.id).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              <div className="flex flex-col h-full">
                <label className="text-[11px] font-semibold text-[#333] mb-1">Descrição</label>
                <input 
                  type="text" 
                  name="description"
                  value={formData.description || ''}
                  onChange={handleChange}
                  className="border border-[#a0a0a0] px-2 py-1 text-[11px] focus:outline-none focus:border-blue-500 bg-white"
                  placeholder="Ex: Categoria de bebidas frescas"
                />
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Footer / Toolbar */}
      <div className="h-12 bg-[#e8e8e8] border-t border-[#d0d0d0] flex items-center justify-between px-4">
        <div className="flex items-center space-x-2"></div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={handleSubmit}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-4 py-1.5 bg-white border border-[#a0a0a0] hover:bg-[#e0e0e0] text-[11px] font-medium disabled:opacity-50"
          >
            <Save size={14} className="text-blue-600" />
            <span>{isLoading ? 'A gravar...' : 'Gravar'}</span>
          </button>
          <button 
            onClick={onCancel}
            className="flex items-center space-x-1.5 px-4 py-1.5 bg-white border border-[#a0a0a0] hover:bg-[#e0e0e0] text-[11px] font-medium"
          >
            <XCircle size={14} className="text-red-600" />
            <span>Cancelar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
