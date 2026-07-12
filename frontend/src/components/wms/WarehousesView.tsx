import React, { useState } from 'react';
import { Package, Plus, Trash2, Save } from 'lucide-react';
import { useWarehouses, useCreateWarehouse, useUpdateWarehouse, useDeleteWarehouse } from '../../hooks/useWms';
import type { WMSWarehouse } from '../../api/wms';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';

export default function WarehousesView() {
  const { data: warehouses } = useWarehouses();
  const createWarehouse = useCreateWarehouse();
  const updateWarehouse = useUpdateWarehouse();
  const deleteWarehouse = useDeleteWarehouse();

  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<WMSWarehouse>>({});

  const handleOpenModal = (warehouse?: WMSWarehouse) => {
    if (warehouse) {
      setEditingId(warehouse.id!);
      setFormData(warehouse);
    } else {
      setEditingId(null);
      setFormData({
        code: '',
        name: '',
        warehouse_type: 'FB',
        status: 'ACTIVE',
        allow_negative_stock: false,
        manage_batches: false,
        manage_expirations: false,
        manage_serial_numbers: false,
        require_outbound_approval: false
      });
    }
    setMode('edit');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateWarehouse.mutate({ id: editingId, data: formData }, {
        onSuccess: () => setMode('list')
      });
    } else {
      createWarehouse.mutate(formData, {
        onSuccess: () => setMode('list')
      });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem a certeza que deseja eliminar este armazém?")) {
      deleteWarehouse.mutate(id);
    }
  };

  if (mode === 'edit') {
    return (
      <ClassicWindow 
        title={editingId ? "Editar Armazém" : "Novo Armazém"}
        icon={<Package size={14} className="text-gray-300" />}
        footer={
          <>
            <div className="flex items-center space-x-2">
              <ClassicButton icon={Save} label="Gravar Armazém" onClick={handleSave as any} />
            </div>
            <div className="flex items-center">
               <ClassicButton label="Cancelar" onClick={() => setMode('list')} />
            </div>
          </>
        }
      >
        <div className="p-4 bg-[#f0f0f0] h-full overflow-y-auto">
          <form id="warehouse-form" onSubmit={handleSave} className="text-[11px] grid grid-cols-1 gap-4">
            
            <div className="border border-[#a0a0a0] bg-white p-2">
              <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Identificação</h3>
              <div className="grid grid-cols-1 gap-y-2 max-w-md">
                <div className="flex items-center">
                  <label className="w-32 font-bold">Código *</label>
                  <input required value={formData.code || ''} onChange={e => setFormData({...formData, code: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Nome *</label>
                  <input required value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Tipo</label>
                  <select value={formData.warehouse_type || 'FB'} onChange={e => setFormData({...formData, warehouse_type: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none bg-white">
                    <option value="FB">F&B</option>
                    <option value="ECON">Economato</option>
                    <option value="MAINT">Manutenção</option>
                    <option value="HOUSE">Housekeeping</option>
                    <option value="OTHER">Outro</option>
                  </select>
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Estado</label>
                  <select value={formData.status || 'ACTIVE'} onChange={e => setFormData({...formData, status: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none bg-white">
                    <option value="ACTIVE">Ativo</option>
                    <option value="INACTIVE">Inativo</option>
                    <option value="INVENTORY">Em Inventário</option>
                    <option value="LOCKED">Bloqueado</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="border border-[#a0a0a0] bg-white p-2 mt-2">
              <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Regras de Motor WMS</h3>
              <div className="flex flex-col space-y-2">
                <label className="flex items-center space-x-2">
                  <input type="checkbox" checked={formData.allow_negative_stock} onChange={e => setFormData({...formData, allow_negative_stock: e.target.checked})} className="w-3 h-3" />
                  <span>Permitir Stock Negativo</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input type="checkbox" checked={formData.manage_batches} onChange={e => setFormData({...formData, manage_batches: e.target.checked})} className="w-3 h-3" />
                  <span>Gerir Lotes (Batches)</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input type="checkbox" checked={formData.manage_expirations} onChange={e => setFormData({...formData, manage_expirations: e.target.checked})} className="w-3 h-3" />
                  <span>Gerir Validades (FEFO)</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input type="checkbox" checked={formData.require_outbound_approval} onChange={e => setFormData({...formData, require_outbound_approval: e.target.checked})} className="w-3 h-3" />
                  <span>Requer Aprovação de Saída</span>
                </label>
              </div>
            </div>

          </form>
        </div>
      </ClassicWindow>
    );
  }

  const columns = [
    { header: 'Código', accessor: 'code', width: '20%' },
    { header: 'Nome do Armazém', accessor: 'name', width: '40%' },
    { header: 'Tipo', accessor: 'warehouse_type', width: '15%' },
    { header: 'Estado', accessor: 'status', width: '15%' },
    { 
      header: 'Ações', 
      accessor: (r: any) => (
        <div className="flex space-x-2">
          <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id!); }} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>
        </div>
      ), 
      width: '10%' 
    },
  ];

  return (
    <ClassicWindow 
      title="Armazéns (WMS)"
      icon={<Package size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={Plus} label="Novo Armazém" onClick={() => handleOpenModal()} />
          </div>
          <div className="text-gray-600">
            Nº registos a visualizar: {warehouses?.length || 0}
          </div>
        </>
      }
    >
      <ClassicGrid 
        columns={columns} 
        data={warehouses || []} 
        onRowClick={(row) => handleOpenModal(row)}
      />
    </ClassicWindow>
  );
}
