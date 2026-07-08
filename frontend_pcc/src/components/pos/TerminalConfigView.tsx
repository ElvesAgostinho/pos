import React, { useState } from 'react';
import { useOutlets, useTerminals, useCreateTerminal, useUpdateTerminal, useDeleteTerminal } from '../../hooks/usePos';
import { Settings, Plus, Edit, Trash2, Save } from 'lucide-react';
import type { POSTerminal } from '../../api/pos';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';

export default function TerminalConfigView() {
  const { data: outlets } = useOutlets();
  const { data: terminals } = useTerminals();
  const createTerminal = useCreateTerminal();
  const updateTerminal = useUpdateTerminal();
  const deleteTerminal = useDeleteTerminal();

  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [selectedTerminal, setSelectedTerminal] = useState<POSTerminal | null>(null);
  
  const [formData, setFormData] = useState<Partial<POSTerminal>>({});

  const handleAddClick = () => {
    setSelectedTerminal(null);
    setFormData({
      code: '', name: '', hotel: '', area: '', restaurant: '', bar: '', cash_register: '',
      currency: 'EUR', language: 'PT-PT', theme: 'Light',
      grid_columns: 6, grid_rows: 4, resolution: '1920x1080', logout_timeout_seconds: 300,
      is_touch_mode: true, is_desktop_mode: false, is_tablet_mode: false, is_kiosk_mode: false,
      is_self_service_mode: false, is_room_service_mode: false, is_delivery_mode: false,
      is_offline_mode: false, is_online_mode: true,
      has_keyboard: true, home_page: 'Categories', favorites_page: true,
      drinks_page: true, desserts_page: true, menus_page: true,
      is_active: true
    });
    setMode('edit');
  };

  const handleEditClick = (terminal: POSTerminal) => {
    setSelectedTerminal(terminal);
    setFormData(terminal);
    setMode('edit');
  };

  const handleDeleteClick = (terminal: POSTerminal) => {
    if (confirm(`Tem a certeza que deseja apagar o terminal ${terminal.name}?`)) {
      deleteTerminal.mutate(terminal.id!);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.outlet) {
      alert("Selecione um Outlet (Ponto de Venda).");
      return;
    }
    if (selectedTerminal?.id) {
      updateTerminal.mutate({ id: selectedTerminal.id, data: formData }, {
        onSuccess: () => setMode('list')
      });
    } else {
      createTerminal.mutate(formData, {
        onSuccess: () => setMode('list')
      });
    }
  };

  if (mode === 'edit') {
    return (
      <ClassicWindow 
        title={selectedTerminal ? "Editar Terminal" : "Novo Terminal"}
        icon={<Settings size={14} className="text-gray-300" />}
        footer={
          <>
            <div className="flex items-center space-x-2">
              <ClassicButton icon={Save} label="Gravar Terminal" onClick={handleSubmit as any} />
            </div>
            <div className="flex items-center">
               <ClassicButton label="Cancelar" onClick={() => setMode('list')} />
            </div>
          </>
        }
      >
        <div className="p-4 bg-[#f0f0f0] h-full overflow-y-auto">
          <form id="terminal-form" onSubmit={handleSubmit} className="text-[11px] grid grid-cols-2 gap-4">
            
            {/* Identificação */}
            <div className="col-span-2 border border-[#a0a0a0] bg-white p-2">
              <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Identificação & Localização</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div className="flex items-center">
                  <label className="w-32 font-bold">Ponto de Venda</label>
                  <select name="outlet" value={formData.outlet || ''} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" required>
                    <option value="">-- Selecione --</option>
                    {outlets?.map(o => <option key={o.id} value={o.id}>{o.code} - {o.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Código do Terminal</label>
                  <input name="code" value={formData.code} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" required />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Nome do Terminal</label>
                  <input name="name" value={formData.name} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" required />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Hotel / Propriedade</label>
                  <input name="hotel" value={formData.hotel} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Área / Zona</label>
                  <input name="area" value={formData.area} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Caixa Registadora</label>
                  <input name="cash_register" value={formData.cash_register} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
              </div>
            </div>

            {/* Sistema Base */}
            <div className="col-span-2 border border-[#a0a0a0] bg-white p-2">
              <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Sistema Base</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div className="flex items-center">
                  <label className="w-32 font-bold">Moeda</label>
                  <input name="currency" value={formData.currency} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Idioma</label>
                  <input name="language" value={formData.language} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Tema Visual</label>
                  <select name="theme" value={formData.theme} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none">
                    <option value="Light">Light (Claro)</option>
                    <option value="Dark">Dark (Escuro)</option>
                    <option value="HighContrast">Alto Contraste</option>
                  </select>
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Resolução do Ecrã</label>
                  <input name="resolution" value={formData.resolution} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Nº Colunas da Grelha</label>
                  <input type="number" name="grid_columns" value={formData.grid_columns} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Nº Linhas da Grelha</label>
                  <input type="number" name="grid_rows" value={formData.grid_rows} onChange={handleChange} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
              </div>
            </div>

            {/* Modos de Operação */}
            <div className="col-span-2 border border-[#a0a0a0] bg-white p-2">
              <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Modos de Operação (Perfis)</h3>
              <div className="grid grid-cols-3 gap-2">
                <label className="flex items-center space-x-2"><input type="checkbox" name="is_touch_mode" checked={formData.is_touch_mode} onChange={handleChange} className="w-3 h-3" /> <span>Modo Touch</span></label>
                <label className="flex items-center space-x-2"><input type="checkbox" name="is_desktop_mode" checked={formData.is_desktop_mode} onChange={handleChange} className="w-3 h-3" /> <span>Modo Desktop (Rato)</span></label>
                <label className="flex items-center space-x-2"><input type="checkbox" name="is_tablet_mode" checked={formData.is_tablet_mode} onChange={handleChange} className="w-3 h-3" /> <span>Modo Tablet</span></label>
                <label className="flex items-center space-x-2"><input type="checkbox" name="is_kiosk_mode" checked={formData.is_kiosk_mode} onChange={handleChange} className="w-3 h-3" /> <span>Modo Kiosk</span></label>
                <label className="flex items-center space-x-2"><input type="checkbox" name="is_self_service_mode" checked={formData.is_self_service_mode} onChange={handleChange} className="w-3 h-3" /> <span>Modo Self-Service</span></label>
                <label className="flex items-center space-x-2"><input type="checkbox" name="is_room_service_mode" checked={formData.is_room_service_mode} onChange={handleChange} className="w-3 h-3" /> <span>Modo Room Service</span></label>
                <label className="flex items-center space-x-2"><input type="checkbox" name="is_delivery_mode" checked={formData.is_delivery_mode} onChange={handleChange} className="w-3 h-3" /> <span>Modo Delivery</span></label>
                <label className="flex items-center space-x-2"><input type="checkbox" name="is_offline_mode" checked={formData.is_offline_mode} onChange={handleChange} className="w-3 h-3" /> <span className="text-red-700 font-bold">Suporta Offline</span></label>
                <label className="flex items-center space-x-2"><input type="checkbox" name="is_online_mode" checked={formData.is_online_mode} onChange={handleChange} className="w-3 h-3" /> <span className="text-green-700 font-bold">Requer Online</span></label>
              </div>
            </div>

            {/* Funcionalidades */}
            <div className="col-span-2 border border-[#a0a0a0] bg-white p-2">
              <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Funcionalidades do POS</h3>
              <div className="grid grid-cols-3 gap-2">
                <label className="flex items-center space-x-2"><input type="checkbox" name="has_keyboard" checked={formData.has_keyboard} onChange={handleChange} className="w-3 h-3" /> <span>Teclado no Ecrã</span></label>
                <label className="flex items-center space-x-2"><input type="checkbox" name="favorites_page" checked={formData.favorites_page} onChange={handleChange} className="w-3 h-3" /> <span>Página Favoritos</span></label>
                <label className="flex items-center space-x-2"><input type="checkbox" name="drinks_page" checked={formData.drinks_page} onChange={handleChange} className="w-3 h-3" /> <span>Página Bebidas Diretas</span></label>
                <label className="flex items-center space-x-2"><input type="checkbox" name="desserts_page" checked={formData.desserts_page} onChange={handleChange} className="w-3 h-3" /> <span>Página Sobremesas</span></label>
                <label className="flex items-center space-x-2"><input type="checkbox" name="menus_page" checked={formData.menus_page} onChange={handleChange} className="w-3 h-3" /> <span>Página de Menus</span></label>
              </div>
            </div>
          </form>
        </div>
      </ClassicWindow>
    );
  }

  const columns = [
    { header: 'Cód.', accessor: 'code', width: '10%' },
    { header: 'Nome', accessor: 'name', width: '25%' },
    { header: 'Outlet', accessor: 'outlet_name', width: '25%' },
    { header: 'Localização', accessor: (r: any) => `${r.hotel || '-'} > ${r.area || '-'}`, width: '20%' },
    { header: 'Resolução', accessor: 'resolution', width: '10%' },
    { 
      header: 'Ações', 
      accessor: (r: any) => (
        <div className="flex space-x-2">
          <button onClick={() => handleDeleteClick(r)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>
        </div>
      ), 
      width: '10%' 
    },
  ];

  return (
    <ClassicWindow 
      title="Terminais POS"
      icon={<Settings size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={Plus} label="Adicionar Terminal" onClick={handleAddClick} />
          </div>
          <div className="text-gray-600">
            Nº registos a visualizar: {terminals?.length || 0}
          </div>
        </>
      }
    >
      <ClassicGrid 
        columns={columns} 
        data={terminals || []} 
        onRowClick={(row) => handleEditClick(row)}
      />
    </ClassicWindow>
  );
}
