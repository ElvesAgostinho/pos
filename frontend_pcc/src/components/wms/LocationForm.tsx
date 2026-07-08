import React, { useState } from 'react';
import type { Location, Warehouse } from '../../api/inventory';
import { Save, X } from 'lucide-react';

interface LocationFormProps {
  initialData?: Location | null;
  warehouses: Warehouse[];
  locations: Location[];
  onSubmit: (data: Partial<Location>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function LocationForm({ initialData, warehouses, locations, onSubmit, onCancel, isLoading }: LocationFormProps) {
  const [activeTab, setActiveTab] = useState('identificacao');
  const [formData, setFormData] = useState<Partial<Location>>(
    initialData || {
      warehouse: warehouses.length > 0 ? warehouses[0].id : undefined,
      parent: null,
      code: '',
      name: '',
      location_type: 'ZONE',
      status: 'ACTIVE',
      max_weight_kg: '0.00',
      max_volume_m3: '0.00',
      temperature_celsius: null,
    }
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value === '' ? null : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const tabs = [
    { id: 'identificacao', label: '1. Identificação' },
    { id: 'fisico', label: '2. Limites Físicos' },
  ];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-[500px]">
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

      <div className="flex-1 overflow-y-auto bg-white p-4 text-xs text-[#333]">
        {activeTab === 'identificacao' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <div className="flex flex-col col-span-2">
                <label className="mb-1 font-semibold">Armazém Pai *</label>
                <select required name="warehouse" value={formData.warehouse || ''} onChange={handleChange} className="border border-[#ccc] p-1.5 focus:outline-none focus:border-blue-500">
                  <option value="">Selecione...</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col">
                <label className="mb-1 font-semibold">Localização Mãe (Opcional)</label>
                <select name="parent" value={formData.parent || ''} onChange={handleChange} className="border border-[#ccc] p-1.5 focus:outline-none focus:border-blue-500">
                  <option value="">Nenhuma (Raiz do Armazém)</option>
                  {locations.filter(l => l.warehouse === Number(formData.warehouse) && l.id !== formData.id).map(l => (
                    <option key={l.id} value={l.id}>{l.code} - {l.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col">
                <label className="mb-1 font-semibold">Tipo *</label>
                <select required name="location_type" value={formData.location_type || 'ZONE'} onChange={handleChange} className="border border-[#ccc] p-1.5 focus:outline-none focus:border-blue-500">
                  <option value="ZONE">Zona</option>
                  <option value="AISLE">Corredor</option>
                  <option value="RACK">Estante</option>
                  <option value="SHELF">Prateleira</option>
                  <option value="BIN">Posição (Bin)</option>
                </select>
              </div>

              <div className="flex flex-col">
                <label className="mb-1 font-semibold">Código Curto *</label>
                <input required type="text" name="code" value={formData.code || ''} onChange={handleChange} className="border border-[#ccc] p-1.5 focus:outline-none focus:border-blue-500" />
              </div>
              <div className="flex flex-col">
                <label className="mb-1 font-semibold">Nome/Descrição *</label>
                <input required type="text" name="name" value={formData.name || ''} onChange={handleChange} className="border border-[#ccc] p-1.5 focus:outline-none focus:border-blue-500" />
              </div>
              
              <div className="flex flex-col">
                <label className="mb-1">Estado</label>
                <select name="status" value={formData.status || 'ACTIVE'} onChange={handleChange} className="border border-[#ccc] p-1.5 focus:outline-none focus:border-blue-500">
                  <option value="ACTIVE">Ativo</option>
                  <option value="MAINTENANCE">Manutenção</option>
                  <option value="BLOCKED">Bloqueado / Quarentena</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'fisico' && (
          <div className="space-y-4">
            <h3 className="font-bold text-gray-700 border-b pb-1 mb-2">Restrições e Capacidades Físicas</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <div className="flex flex-col">
                <label className="mb-1">Peso Máximo (Kg)</label>
                <input type="number" step="0.01" name="max_weight_kg" value={formData.max_weight_kg || '0'} onChange={handleChange} className="border border-[#ccc] p-1.5 focus:outline-none focus:border-blue-500" />
              </div>
              <div className="flex flex-col">
                <label className="mb-1">Volume Máximo (m3)</label>
                <input type="number" step="0.01" name="max_volume_m3" value={formData.max_volume_m3 || '0'} onChange={handleChange} className="border border-[#ccc] p-1.5 focus:outline-none focus:border-blue-500" />
              </div>
              <div className="flex flex-col">
                <label className="mb-1">Temperatura Ideal (ºC)</label>
                <input type="number" step="0.1" name="temperature_celsius" value={formData.temperature_celsius || ''} onChange={handleChange} className="border border-[#ccc] p-1.5 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end space-x-2 p-3 bg-[#e8e8e8] border-t border-[#ccc]">
        <button type="button" onClick={onCancel} className="px-4 py-1.5 border border-[#ccc] bg-white text-[#333] hover:bg-[#f0f0f0] flex items-center text-xs">
          <X size={14} className="mr-1.5" />
          Cancelar
        </button>
        <button type="submit" disabled={isLoading} className="px-4 py-1.5 bg-blue-600 text-white border border-blue-700 hover:bg-blue-700 flex items-center text-xs disabled:opacity-50">
          <Save size={14} className="mr-1.5" />
          {isLoading ? 'A Guardar...' : 'Guardar Localização'}
        </button>
      </div>
    </form>
  );
}
