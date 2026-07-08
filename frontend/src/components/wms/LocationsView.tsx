import React, { useState, useEffect } from 'react';
import { Network, Plus, Trash2, Edit2, ChevronRight, ChevronDown, Save } from 'lucide-react';
import { useWarehouses, useLocationsTree, useCreateLocation, useUpdateLocation, useDeleteLocation } from '../../hooks/useWms';
import type { WMSLocation } from '../../api/wms';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';

const LocationNode = ({ 
  node, 
  level = 0, 
  onEdit, 
  onDelete, 
  onAddChild 
}: { 
  node: WMSLocation, 
  level?: number, 
  onEdit: (loc: WMSLocation) => void, 
  onDelete: (id: string) => void,
  onAddChild: (parent: WMSLocation) => void
}) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  
  const typeColors: Record<string, string> = {
    'ZONE': 'bg-[#e0e0e0] border-[#a0a0a0]',
    'AISLE': 'bg-white border-[#ccc]',
    'RACK': 'bg-white border-[#ccc]',
    'SHELF': 'bg-white border-[#ccc]',
    'BIN': 'bg-white border-[#ccc]',
  };

  return (
    <div className="select-none text-[11px] font-sans">
      <div 
        className={`flex items-center p-1 border-b border-[#e0e0e0] hover:bg-[#ffe8a1] transition-colors`}
        style={{ paddingLeft: `${level * 16 + 4}px` }}
      >
        <button 
          onClick={() => setExpanded(!expanded)} 
          className={`mr-1 ${!hasChildren && 'invisible'}`}
        >
          {expanded ? <ChevronDown size={12} className="text-gray-600" /> : <ChevronRight size={12} className="text-gray-600" />}
        </button>
        
        <span className={`px-1 rounded-sm border mr-2 uppercase text-[9px] font-bold ${typeColors[node.location_type] || 'bg-white border-[#ccc]'}`}>
          {node.location_type}
        </span>
        
        <span className="font-bold text-[#333] mr-2 w-16">{node.code}</span>
        <span className="text-gray-800 flex-1">{node.name}</span>
        
        <div className="flex space-x-2 mr-2">
          {node.location_type !== 'BIN' && (
            <button onClick={() => onAddChild(node)} className="text-blue-600 hover:text-blue-800" title="Adicionar Sub-localização">
              <Plus size={12} />
            </button>
          )}
          <button onClick={() => onEdit(node)} className="text-gray-600 hover:text-black" title="Editar">
            <Edit2 size={12} />
          </button>
          <button onClick={() => onDelete(node.id!)} className="text-red-500 hover:text-red-800" title="Eliminar">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      
      {expanded && hasChildren && (
        <div className="flex flex-col border-l border-dotted border-gray-400 ml-3">
          {node.children!.map(child => (
            <LocationNode 
              key={child.id} 
              node={child} 
              level={level + 1} 
              onEdit={onEdit} 
              onDelete={onDelete} 
              onAddChild={onAddChild} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function LocationsView() {
  const { data: warehouses } = useWarehouses();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  
  const { data: locationsTree, isLoading } = useLocationsTree(selectedWarehouseId);
  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();
  const deleteLocation = useDeleteLocation();

  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<WMSLocation>>({});

  useEffect(() => {
    if (warehouses && warehouses.length > 0 && !selectedWarehouseId) {
      setSelectedWarehouseId(warehouses[0].id!);
    }
  }, [warehouses]);

  const handleOpenModal = (location?: WMSLocation, parent?: WMSLocation) => {
    if (location) {
      setEditingId(location.id!);
      setFormData(location);
    } else {
      setEditingId(null);
      let nextType = 'ZONE';
      if (parent) {
        if (parent.location_type === 'ZONE') nextType = 'AISLE';
        else if (parent.location_type === 'AISLE') nextType = 'RACK';
        else if (parent.location_type === 'RACK') nextType = 'SHELF';
        else if (parent.location_type === 'SHELF') nextType = 'BIN';
      }
      
      setFormData({
        warehouse: selectedWarehouseId!,
        parent: parent?.id || null,
        location_type: nextType,
        code: '',
        name: '',
        status: 'ACTIVE',
        block_inbound: false,
        block_outbound: false,
        allow_mixed_items: true,
        allow_mixed_batches: true
      });
    }
    setMode('edit');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateLocation.mutate({ id: editingId, data: formData }, {
        onSuccess: () => setMode('list')
      });
    } else {
      createLocation.mutate(formData, {
        onSuccess: () => setMode('list')
      });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Atenção: Eliminar esta localização irá eliminar TODAS as sub-localizações dependentes. Deseja continuar?")) {
      deleteLocation.mutate(id);
    }
  };

  if (mode === 'edit') {
    return (
      <ClassicWindow 
        title={editingId ? "Editar Localização" : "Nova Localização"}
        icon={<Network size={14} className="text-gray-300" />}
        footer={
          <>
            <div className="flex items-center space-x-2">
              <ClassicButton icon={Save} label="Gravar Localização" onClick={handleSave as any} />
            </div>
            <div className="flex items-center">
               <ClassicButton label="Cancelar" onClick={() => setMode('list')} />
            </div>
          </>
        }
      >
        <div className="p-4 bg-[#f0f0f0] h-full overflow-y-auto">
          <form id="location-form" onSubmit={handleSave} className="text-[11px] grid grid-cols-1 gap-4">
            
            <div className="border border-[#a0a0a0] bg-white p-2">
              <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Identificação</h3>
              <div className="grid grid-cols-1 gap-y-2 max-w-md">
                <div className="flex items-center">
                  <label className="w-32 font-bold">Nível Logístico</label>
                  <select value={formData.location_type || 'ZONE'} onChange={e => setFormData({...formData, location_type: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none bg-white">
                    <option value="ZONE">Zona (Módulo Central)</option>
                    <option value="AISLE">Corredor (Aisle)</option>
                    <option value="RACK">Estante (Rack)</option>
                    <option value="SHELF">Prateleira (Shelf)</option>
                    <option value="BIN">Posição Fina (Bin)</option>
                  </select>
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Código Curto</label>
                  <input required value={formData.code || ''} onChange={e => setFormData({...formData, code: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Nome Descritivo</label>
                  <input required value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
              </div>
            </div>

            <div className="border border-[#a0a0a0] bg-white p-2 mt-2">
              <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Capacidades & Restrições</h3>
              <div className="grid grid-cols-1 gap-y-2 max-w-md">
                <div className="flex items-center">
                  <label className="w-32 font-bold">Peso Máx. (Kg)</label>
                  <input type="number" step="0.1" value={formData.max_weight_kg || ''} onChange={e => setFormData({...formData, max_weight_kg: parseFloat(e.target.value)})} className="w-24 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Temp. Ideal (ºC)</label>
                  <input type="number" step="0.1" value={formData.ideal_temperature_c || ''} onChange={e => setFormData({...formData, ideal_temperature_c: parseFloat(e.target.value)})} className="w-24 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center mt-2">
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" checked={formData.block_inbound} onChange={e => setFormData({...formData, block_inbound: e.target.checked})} className="w-3 h-3" />
                    <span>Bloquear Entradas</span>
                  </label>
                </div>
                <div className="flex items-center">
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" checked={formData.block_outbound} onChange={e => setFormData({...formData, block_outbound: e.target.checked})} className="w-3 h-3" />
                    <span>Bloquear Saídas</span>
                  </label>
                </div>
              </div>
            </div>

          </form>
        </div>
      </ClassicWindow>
    );
  }

  return (
    <ClassicWindow 
      title="Layout Físico (Localizações)"
      icon={<Network size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={Plus} label="Nova Zona" onClick={() => handleOpenModal()} disabled={!selectedWarehouseId} />
          </div>
          <div className="text-gray-600">
            {locationsTree?.length ? `Nº zonas raízes: ${locationsTree.length}` : ''}
          </div>
        </>
      }
    >
      <div className="flex flex-col h-full bg-white">
        {/* Selector Header */}
        <div className="flex items-center p-2 border-b border-[#a0a0a0] bg-[#f0f0f0] text-[11px]">
          <span className="font-bold mr-2">Armazém:</span>
          <select 
            value={selectedWarehouseId || ''} 
            onChange={e => setSelectedWarehouseId(e.target.value)}
            className="border border-[#a0a0a0] bg-white p-1 focus:outline-none w-64"
          >
            <option value="" disabled>Selecionar Armazém</option>
            {warehouses?.map(w => (
              <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
            ))}
          </select>
        </div>

        {/* Tree List */}
        <div className="flex-1 overflow-auto bg-white p-2">
          {!selectedWarehouseId ? (
            <div className="text-gray-500 text-[11px] p-4 text-center border border-[#d0d0d0] bg-[#f9f9f9]">
              Selecione um armazém para gerir o seu layout.
            </div>
          ) : isLoading ? (
            <div className="text-gray-500 text-[11px] p-4 text-center border border-[#d0d0d0] bg-[#f9f9f9]">
              A carregar árvore de localizações...
            </div>
          ) : locationsTree && locationsTree.length > 0 ? (
            <div className="border border-[#a0a0a0] bg-white">
              <div className="bg-[#d0d0d0] border-b border-[#a0a0a0] p-1 flex text-[10px] font-bold text-gray-800">
                <div className="w-16">Nível</div>
                <div className="w-16">Código</div>
                <div className="flex-1">Nome / Descrição</div>
                <div className="w-20 pr-2 text-right">Ações</div>
              </div>
              <div className="flex flex-col pb-2">
                {locationsTree.map(rootNode => (
                  <LocationNode 
                    key={rootNode.id} 
                    node={rootNode} 
                    onEdit={loc => handleOpenModal(loc)}
                    onDelete={handleDelete}
                    onAddChild={parent => handleOpenModal(undefined, parent)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-[11px] p-4 text-center border border-[#d0d0d0] bg-[#f9f9f9]">
              Nenhuma zona criada neste armazém. Comece por criar uma "Nova Zona".
            </div>
          )}
        </div>
      </div>
    </ClassicWindow>
  );
}
