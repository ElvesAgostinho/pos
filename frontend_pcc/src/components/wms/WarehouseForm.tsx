import React, { useState } from 'react';
import type { Warehouse } from '../../api/inventory';
import { Save, X } from 'lucide-react';

interface WarehouseFormProps {
  initialData?: Warehouse | null;
  onSubmit: (data: Partial<Warehouse>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function WarehouseForm({ initialData, onSubmit, onCancel, isLoading }: WarehouseFormProps) {
  const [activeTab, setActiveTab] = useState('geral');
  const [formData, setFormData] = useState<Partial<Warehouse>>(
    initialData || {
      code: '',
      name: '',
      status: 'ACTIVE',
      hotel_id: '',
      department_id: '',
      warehouse_type: 'Geral',
      cost_center: '',
      manager_name: '',
      allow_negative_stock: false,
      requires_approval_for_out: false,
      manages_batches: false,
      manages_expiry: false,
    }
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const tabs = [
    { id: 'geral', label: '1. Geral & Classificação' },
    { id: 'wms', label: '2. Parâmetros WMS' },
  ];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-[500px]">
      {/* Tabs */}
      <div className="flex border-b border-[#ccc] bg-[#f0f0f0] pt-2 px-2">
        {tabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-1.5 text-xs cursor-pointer border border-b-0 rounded-t-sm mx-0.5 ${
              activeTab === tab.id 
                ? 'bg-white border-[#ccc] font-bold text-[#333] relative -bottom-px' 
                : 'bg-[#e0e0e0] border-transparent text-[#666] hover:bg-[#e8e8e8]'
            }`}
          >
            {tab.label}
          </div>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto bg-white p-4 text-xs text-[#333]">
        {activeTab === 'geral' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <div className="flex flex-col">
                <label className="mb-1 font-semibold">Código do Armazém *</label>
                <input required type="text" name="code" value={formData.code || ''} onChange={handleChange} className="border border-[#ccc] p-1.5 focus:outline-none focus:border-blue-500" />
              </div>
              <div className="flex flex-col">
                <label className="mb-1 font-semibold">Nome do Armazém *</label>
                <input required type="text" name="name" value={formData.name || ''} onChange={handleChange} className="border border-[#ccc] p-1.5 focus:outline-none focus:border-blue-500" />
              </div>
              
              <div className="flex flex-col">
                <label className="mb-1">Hotel / Filial</label>
                <input type="text" name="hotel_id" value={formData.hotel_id || ''} onChange={handleChange} className="border border-[#ccc] p-1.5 focus:outline-none focus:border-blue-500" />
              </div>
              <div className="flex flex-col">
                <label className="mb-1">Departamento</label>
                <input type="text" name="department_id" value={formData.department_id || ''} onChange={handleChange} className="border border-[#ccc] p-1.5 focus:outline-none focus:border-blue-500" />
              </div>

              <div className="flex flex-col">
                <label className="mb-1">Tipo de Armazém</label>
                <select name="warehouse_type" value={formData.warehouse_type || ''} onChange={handleChange} className="border border-[#ccc] p-1.5 focus:outline-none focus:border-blue-500">
                  <option value="Geral">Geral</option>
                  <option value="Economato">Economato</option>
                  <option value="F&B">F&B (Restaurante/Bar)</option>
                  <option value="Manutenção">Manutenção</option>
                  <option value="Spa">Spa</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className="mb-1">Estado</label>
                <select name="status" value={formData.status || 'ACTIVE'} onChange={handleChange} className="border border-[#ccc] p-1.5 focus:outline-none focus:border-blue-500">
                  <option value="ACTIVE">Ativo</option>
                  <option value="INVENTORY">Em Inventário (Bloqueado)</option>
                  <option value="INACTIVE">Inativo</option>
                </select>
              </div>

              <div className="flex flex-col">
                <label className="mb-1">Centro de Custo Financeiro</label>
                <input type="text" name="cost_center" value={formData.cost_center || ''} onChange={handleChange} className="border border-[#ccc] p-1.5 focus:outline-none focus:border-blue-500" />
              </div>
              <div className="flex flex-col">
                <label className="mb-1">Gestor / Responsável Físico</label>
                <input type="text" name="manager_name" value={formData.manager_name || ''} onChange={handleChange} className="border border-[#ccc] p-1.5 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'wms' && (
          <div className="space-y-4">
            <h3 className="font-bold text-gray-700 border-b pb-1 mb-2">Parâmetros Operacionais e Restrições</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <label className="flex items-center space-x-2">
                <input type="checkbox" name="allow_negative_stock" checked={formData.allow_negative_stock || false} onChange={handleChange} />
                <span>Permite Stock Negativo (Atenção)</span>
              </label>
              
              <label className="flex items-center space-x-2">
                <input type="checkbox" name="requires_approval_for_out" checked={formData.requires_approval_for_out || false} onChange={handleChange} />
                <span>Requer Aprovação para Saídas/Consumos</span>
              </label>

              <label className="flex items-center space-x-2">
                <input type="checkbox" name="manages_batches" checked={formData.manages_batches || false} onChange={handleChange} />
                <span>Gere Lotes Obrigatoriamente</span>
              </label>

              <label className="flex items-center space-x-2">
                <input type="checkbox" name="manages_expiry" checked={formData.manages_expiry || false} onChange={handleChange} />
                <span>Gere Validades Obrigatoriamente</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end space-x-2 p-3 bg-[#e8e8e8] border-t border-[#ccc]">
        <button type="button" onClick={onCancel} className="px-4 py-1.5 border border-[#ccc] bg-white text-[#333] hover:bg-[#f0f0f0] flex items-center text-xs">
          <X size={14} className="mr-1.5" />
          Cancelar
        </button>
        <button type="submit" disabled={isLoading} className="px-4 py-1.5 bg-blue-600 text-white border border-blue-700 hover:bg-blue-700 flex items-center text-xs disabled:opacity-50">
          <Save size={14} className="mr-1.5" />
          {isLoading ? 'A Guardar...' : 'Guardar Armazém'}
        </button>
      </div>
    </form>
  );
}
