import React, { useState, useEffect } from 'react';
import type { Tax } from '../../api/mdm';
import { Save, XCircle } from 'lucide-react';

interface TaxFormProps {
  initialData?: Tax | null;
  onSubmit: (data: Partial<Tax>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function TaxForm({ initialData, onSubmit, onCancel, isLoading }: TaxFormProps) {
  const [formData, setFormData] = useState<Partial<Tax>>({
    code: '',
    name: '',
    percentage: '',
  });

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
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
                <label className="text-[11px] font-semibold text-[#333] mb-1">Código do Imposto *</label>
                <input 
                  type="text" 
                  name="code"
                  value={formData.code || ''}
                  onChange={handleChange}
                  className="border border-[#a0a0a0] px-2 py-1 text-[11px] focus:outline-none focus:border-blue-500 bg-white"
                  placeholder="Ex: IVA23"
                  required
                />
              </div>

              <div className="flex flex-col">
                <label className="text-[11px] font-semibold text-[#333] mb-1">Nome / Descrição *</label>
                <input 
                  type="text" 
                  name="name"
                  value={formData.name || ''}
                  onChange={handleChange}
                  className="border border-[#a0a0a0] px-2 py-1 text-[11px] focus:outline-none focus:border-blue-500 bg-white"
                  placeholder="Ex: IVA Taxa Normal (23%)"
                  required
                />
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              <div className="flex flex-col">
                <label className="text-[11px] font-semibold text-[#333] mb-1">Taxa (%) *</label>
                <input 
                  type="number"
                  step="0.01" 
                  name="percentage"
                  value={formData.percentage || ''}
                  onChange={handleChange}
                  className="border border-[#a0a0a0] px-2 py-1 text-[11px] focus:outline-none focus:border-blue-500 bg-[#ffffe0]"
                  placeholder="Ex: 23.00"
                  required
                />
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Footer / Toolbar */}
      <div className="h-12 bg-[#e8e8e8] border-t border-[#d0d0d0] flex items-center justify-between px-4">
        <div className="flex items-center space-x-2">
          {/* Pode ter outros botões de rodapé se necessário */}
        </div>
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
