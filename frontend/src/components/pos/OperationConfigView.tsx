import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Save, Plus, Trash2 } from 'lucide-react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { useOutlets, useOperationConfigs, useCreateOperationConfig, useUpdateOperationConfig, useDiningTables, useCreateDiningTable, useUpdateDiningTable, useDeleteDiningTable, usePaymentMethods, useCreatePaymentMethod, useDeletePaymentMethod, useOrderTypes, useCreateOrderType, useDeleteOrderType } from '../../hooks/usePos';
import type { POSOperationConfig } from '../../api/pos';

export default function OperationConfigView() {
  const [activeTab, setActiveTab] = useState('rules');
  const [selectedOutletId, setSelectedOutletId] = useState<number | null>(null);

  const { data: outlets } = useOutlets();
  const { data: operationConfigs } = useOperationConfigs();
  const { data: tables } = useDiningTables();
  const { data: paymentMethods } = usePaymentMethods();
  const { data: orderTypes } = useOrderTypes();

  const updateConfig = useUpdateOperationConfig();
  const createConfig = useCreateOperationConfig();
  
  const createTable = useCreateDiningTable();
  const updateTable = useUpdateDiningTable();
  const deleteTable = useDeleteDiningTable();

  const createPayment = useCreatePaymentMethod();
  const deletePayment = useDeletePaymentMethod();

  const createOrderType = useCreateOrderType();
  const deleteOrderType = useDeleteOrderType();

  const [formData, setFormData] = useState<Partial<POSOperationConfig> | null>(null);

  // Custom Prompt Modal State
  const [promptConfig, setPromptConfig] = useState<{
    isOpen: boolean;
    title: string;
    value: string;
    onSubmit: (val: string) => void;
  }>({
    isOpen: false,
    title: '',
    value: '',
    onSubmit: () => {}
  });

  const openPrompt = (title: string, onSubmit: (val: string) => void) => {
    setPromptConfig({ isOpen: true, title, value: '', onSubmit });
  };

  useEffect(() => {
    if (outlets && outlets.length > 0 && !selectedOutletId) {
      setSelectedOutletId(outlets[0].id!);
    }
  }, [outlets]);

  useEffect(() => {
    if (selectedOutletId && operationConfigs) {
      const config = operationConfigs.find(c => c.outlet === selectedOutletId);
      if (config) {
        setFormData(config);
      } else {
        setFormData({
          outlet: selectedOutletId,
          allow_join_tables: true,
          allow_split_tables: true,
          allow_move_tables: true,
          allow_transfer_accounts: true,
          allow_partial_close: true,
          allow_split_by_pax: true,
          allow_split_equal: true,
          allow_split_by_item: true,
          allow_reopen_account: false,
          allow_immediate_order: true,
          allow_scheduled_order: false,
          allow_takeaway: true,
          allow_delivery: false,
          allow_room_charge: false,
          allow_spa_charge: false
        });
      }
    }
  }, [selectedOutletId, operationConfigs]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = async () => {
    if (formData) {
      if (formData.id) {
        await updateConfig.mutateAsync({ id: formData.id, data: formData });
        alert('Configuração gravada com sucesso!');
      } else {
        await createConfig.mutateAsync(formData);
        alert('Configuração criada com sucesso!');
      }
    }
  };

  const handleAddTable = () => {
    if (!selectedOutletId) return;
    openPrompt('Insira o Número da Mesa:', async (tableNum) => {
      if (tableNum) {
        await createTable.mutateAsync({
          outlet: selectedOutletId,
          table_number: tableNum,
          x_position: Math.floor(Math.random() * 300 + 50),
          y_position: Math.floor(Math.random() * 200 + 50),
          width: 60,
          height: 60,
          shape: 'square'
        });
      }
    });
  };

  const handleAddPayment = () => {
    if (!selectedOutletId) return;
    openPrompt('Insira o Nome do Método de Pagamento:', async (name) => {
      if (name) {
        await createPayment.mutateAsync({
          outlet: selectedOutletId,
          name: name,
          is_active: true
        });
      }
    });
  };

  const handleAddOrderType = () => {
    if (!selectedOutletId) return;
    openPrompt('Insira o Nome do Tipo de Pedido:', async (name) => {
      if (name) {
        await createOrderType.mutateAsync({
          outlet: selectedOutletId,
          name: name,
          is_active: true
        });
      }
    });
  };

  // Fix Drag and Drop issue
  const [draggingTableId, setDraggingTableId] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent, tableId: number, _currentX: number, _currentY: number) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setDraggingTableId(tableId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggingTableId === null) return;
    
    const containerEl = document.getElementById('table-container');
    if (!containerEl) return;
    
    const container = containerEl.getBoundingClientRect();
    
    let newX = e.clientX - container.left - dragOffset.x;
    let newY = e.clientY - container.top - dragOffset.y;
    
    newX = Math.max(0, Math.min(newX, container.width - 60)); 
    newY = Math.max(0, Math.min(newY, container.height - 60));

    const tableEl = document.getElementById(`table-${draggingTableId}`);
    if (tableEl) {
      tableEl.style.left = `${newX}px`;
      tableEl.style.top = `${newY}px`;
    }
  }, [draggingTableId, dragOffset]);

  const handleMouseUp = useCallback(async (_e: MouseEvent) => {
    if (draggingTableId !== null) {
      const currentId = draggingTableId;
      setDraggingTableId(null);
      
      const tableEl = document.getElementById(`table-${currentId}`);
      if (tableEl) {
        let newX = parseInt(tableEl.style.left || '0', 10);
        let newY = parseInt(tableEl.style.top || '0', 10);
        
        try {
          await updateTable.mutateAsync({
            id: currentId,
            data: {
              x_position: newX,
              y_position: newY
            }
          });
        } catch (err) {
          console.error('Failed to save table position', err);
        }
      }
    }
  }, [draggingTableId, updateTable]);

  useEffect(() => {
    if (draggingTableId !== null) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingTableId, handleMouseMove, handleMouseUp]);

  const currentTables = tables?.filter(t => t.outlet === selectedOutletId) || [];
  const currentPayments = paymentMethods?.filter(p => p.outlet === selectedOutletId) || [];
  const currentOrderTypes = orderTypes?.filter(o => o.outlet === selectedOutletId) || [];

  const tabClass = (tab: string) => `px-3 py-1 bg-[#f0f0f0] border border-[#a0a0a0] border-b-0 -mb-[1px] text-[11px] font-sans ${activeTab === tab ? 'bg-white font-bold z-10 border-b-white' : 'cursor-pointer hover:bg-[#e8e8e8]'}`;

  return (
    <>
      <ClassicWindow 
        title="Motor de Operação"
      icon={<Settings size={14} className="text-gray-300" />}
      footer={
        activeTab === 'rules' && formData ? (
          <>
            <div className="flex items-center space-x-2">
              <ClassicButton icon={Save} label="Gravar Configurações" onClick={handleSave} />
            </div>
            <div className="flex items-center">
            </div>
          </>
        ) : undefined
      }
    >
      <div className="p-2 flex flex-col h-full bg-[#e8e8e8]">
        {/* Header Outlet Selector */}
        <div className="bg-[#f0f0f0] border border-[#a0a0a0] p-2 mb-2 flex items-center">
          <label className="text-gray-700 font-bold mr-2 text-[11px]">Outlet:</label>
          <select 
            value={selectedOutletId || ''} 
            onChange={e => setSelectedOutletId(Number(e.target.value))}
            className="border border-[#a0a0a0] px-1 py-0.5 text-[11px] focus:outline-none"
          >
            <option value="" disabled>Selecionar Outlet</option>
            {outlets?.map(o => (
              <option key={o.id} value={o.id}>{o.code} - {o.name}</option>
            ))}
          </select>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#a0a0a0] z-0">
          <div className={tabClass('rules')} onClick={() => setActiveTab('rules')}>Regras Operacionais</div>
          <div className={tabClass('tables')} onClick={() => setActiveTab('tables')}>Planta de Mesas</div>
          <div className={tabClass('orders_payments')} onClick={() => setActiveTab('orders_payments')}>Tipos de Pedido & Pagamentos</div>
        </div>

        <div className="flex-1 overflow-auto bg-white border border-[#a0a0a0] border-t-0 p-3">
          {!selectedOutletId ? (
            <div className="text-center text-gray-500 mt-10">Selecione um Outlet para configurar.</div>
          ) : (
            <>
              {activeTab === 'rules' && formData && (
                <div className="grid grid-cols-2 gap-6 text-[11px]">
                  <div>
                    <h3 className="font-bold text-[#1e3f66] mb-2 border-b border-[#a0a0a0] pb-1">Lógica de Mesas & Contas</h3>
                    <div className="space-y-1">
                      <label className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-[#f0f0f0]">
                        <input type="checkbox" name="allow_join_tables" checked={formData.allow_join_tables} onChange={handleChange} className="w-3 h-3" />
                        <span>Permitir juntar mesas</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-[#f0f0f0]">
                        <input type="checkbox" name="allow_split_tables" checked={formData.allow_split_tables} onChange={handleChange} className="w-3 h-3" />
                        <span>Permitir dividir mesas</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-[#f0f0f0]">
                        <input type="checkbox" name="allow_move_tables" checked={formData.allow_move_tables} onChange={handleChange} className="w-3 h-3" />
                        <span>Permitir mover clientes (Trocar de mesa)</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-[#f0f0f0]">
                        <input type="checkbox" name="allow_transfer_accounts" checked={formData.allow_transfer_accounts} onChange={handleChange} className="w-3 h-3" />
                        <span>Permitir transferir itens para outra conta</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-[#f0f0f0]">
                        <input type="checkbox" name="allow_partial_close" checked={formData.allow_partial_close} onChange={handleChange} className="w-3 h-3" />
                        <span>Permitir fecho parcial de conta</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-[#f0f0f0]">
                        <input type="checkbox" name="allow_split_by_pax" checked={formData.allow_split_by_pax} onChange={handleChange} className="w-3 h-3" />
                        <span>Permitir dividir pagamento por Pax (Pessoas)</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-[#f0f0f0]">
                        <input type="checkbox" name="allow_split_equal" checked={formData.allow_split_equal} onChange={handleChange} className="w-3 h-3" />
                        <span>Permitir dividir pagamento em partes iguais</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-[#f0f0f0]">
                        <input type="checkbox" name="allow_split_by_item" checked={formData.allow_split_by_item} onChange={handleChange} className="w-3 h-3" />
                        <span>Permitir dividir pagamento por item consumido</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-[#f0f0f0]">
                        <input type="checkbox" name="allow_reopen_account" checked={formData.allow_reopen_account} onChange={handleChange} className="w-3 h-3" />
                        <span>Permitir reabrir contas fechadas</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-[#1e3f66] mb-2 border-b border-[#a0a0a0] pb-1">Tipologias de Pedido</h3>
                    <div className="space-y-1">
                      <label className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-[#f0f0f0]">
                        <input type="checkbox" name="allow_immediate_order" checked={formData.allow_immediate_order} onChange={handleChange} className="w-3 h-3" />
                        <span>Pedido Imediato (Balcão)</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-[#f0f0f0]">
                        <input type="checkbox" name="allow_scheduled_order" checked={formData.allow_scheduled_order} onChange={handleChange} className="w-3 h-3" />
                        <span>Pedido Programado (Agendamento de hora)</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-[#f0f0f0]">
                        <input type="checkbox" name="allow_takeaway" checked={formData.allow_takeaway} onChange={handleChange} className="w-3 h-3" />
                        <span>Permitir Takeaway</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-[#f0f0f0]">
                        <input type="checkbox" name="allow_delivery" checked={formData.allow_delivery} onChange={handleChange} className="w-3 h-3" />
                        <span>Permitir Delivery</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-[#f0f0f0]">
                        <input type="checkbox" name="allow_room_charge" checked={formData.allow_room_charge} onChange={handleChange} className="w-3 h-3" />
                        <span>Lançamento em Conta de Quarto (PMS)</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-[#f0f0f0]">
                        <input type="checkbox" name="allow_spa_charge" checked={formData.allow_spa_charge} onChange={handleChange} className="w-3 h-3" />
                        <span>Lançamento em Conta de SPA</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'tables' && (
                <div className="flex flex-col h-full border border-[#a0a0a0]">
                  <div className="bg-[#f0f0f0] border-b border-[#a0a0a0] p-1 flex justify-between items-center">
                    <span className="font-bold text-[#1e3f66] ml-2">Layout Builder Estático</span>
                    <ClassicButton icon={Plus} label="Adicionar Mesa" onClick={handleAddTable} />
                  </div>
                  <div 
                    id="table-container"
                    className="flex-1 bg-white relative overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-[#f5f5f5]"
                  >
                    {currentTables.length === 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-500">Nenhuma mesa configurada.</div>
                    ) : (
                      currentTables.map(t => (
                        <div 
                          key={t.id} 
                          id={`table-${t.id}`}
                          onMouseDown={e => handleMouseDown(e, t.id!, t.x_position || 50, t.y_position || 50)}
                          className={`absolute border border-black bg-[#e0e0e0] flex flex-col items-center justify-center cursor-move text-[11px] font-bold text-black ${draggingTableId === t.id ? 'opacity-80 ring-2 ring-blue-500' : ''}`}
                          style={{
                            left: `${t.x_position || 50}px`,
                            top: `${t.y_position || 50}px`,
                            width: `${t.width || 60}px`,
                            height: `${t.height || 60}px`,
                            borderRadius: t.shape === 'circle' ? '50%' : '0'
                          }}
                        >
                          {t.table_number}
                          <button onClick={(e) => { e.stopPropagation(); deleteTable.mutate(t.id!); }} className="text-red-600 hover:text-red-800 mt-1"><Trash2 size={10}/></button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'orders_payments' && (
                <div className="grid grid-cols-2 gap-4 h-full">
                  <div className="flex flex-col border border-[#a0a0a0]">
                    <div className="bg-[#f0f0f0] border-b border-[#a0a0a0] p-1 flex justify-between items-center">
                      <span className="font-bold text-[#1e3f66] ml-2">Métodos de Pagamento</span>
                      <ClassicButton icon={Plus} label="Adicionar Método" onClick={handleAddPayment} />
                    </div>
                    <div className="flex-1 overflow-auto">
                      <ClassicGrid 
                        columns={[
                          { header: 'Nome', accessor: 'name', width: '50%' },
                          { header: 'Ativo', accessor: (r) => r.is_active ? 'Sim' : 'Não', width: '20%' },
                          { header: 'Autorização', accessor: (r) => r.requires_authorization ? 'Sim' : 'Não', width: '20%' },
                          { header: '', accessor: (r) => <button onClick={() => deletePayment.mutate(r.id!)} className="text-red-600"><Trash2 size={12}/></button>, width: '10%' }
                        ]}
                        data={currentPayments}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col border border-[#a0a0a0]">
                    <div className="bg-[#f0f0f0] border-b border-[#a0a0a0] p-1 flex justify-between items-center">
                      <span className="font-bold text-[#1e3f66] ml-2">Tipos de Pedido</span>
                      <ClassicButton icon={Plus} label="Adicionar Tipo" onClick={handleAddOrderType} />
                    </div>
                    <div className="flex-1 overflow-auto">
                      <ClassicGrid 
                        columns={[
                          { header: 'Nome', accessor: 'name', width: '50%' },
                          { header: 'Taxa', accessor: 'tax_behavior', width: '20%' },
                          { header: 'Ativo', accessor: (r) => r.is_active ? 'Sim' : 'Não', width: '20%' },
                          { header: '', accessor: (r) => <button onClick={() => deleteOrderType.mutate(r.id!)} className="text-red-600"><Trash2 size={12}/></button>, width: '10%' }
                        ]}
                        data={currentOrderTypes}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ClassicWindow>

    {/* Custom Prompt Modal */}
    {promptConfig.isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
        <div className="bg-[#f0f0f0] border-2 border-[#a0a0a0] shadow-lg w-80 shadow-[2px_2px_10px_rgba(0,0,0,0.5)]">
          <div className="bg-gradient-to-r from-[#1e3f66] to-[#2a5a8f] text-white px-2 py-1 flex justify-between items-center select-none font-bold text-[11px]">
            <span>System Mwana Lodge diz:</span>
            <button onClick={() => setPromptConfig(p => ({...p, isOpen: false}))} className="hover:bg-red-600 px-2 rounded-sm text-white">✕</button>
          </div>
          <div className="p-4 bg-white text-[11px] font-sans">
            <label className="block mb-2 font-bold text-gray-800">{promptConfig.title}</label>
            <input 
              autoFocus
              type="text" 
              value={promptConfig.value}
              onChange={e => setPromptConfig(p => ({...p, value: e.target.value}))}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  promptConfig.onSubmit(promptConfig.value);
                  setPromptConfig(p => ({...p, isOpen: false}));
                } else if (e.key === 'Escape') {
                  setPromptConfig(p => ({...p, isOpen: false}));
                }
              }}
              className="w-full border border-[#a0a0a0] p-1 focus:outline-none focus:ring-1 focus:ring-black"
            />
          </div>
          <div className="p-2 bg-[#f0f0f0] border-t border-[#a0a0a0] flex justify-end space-x-2">
            <ClassicButton label="Cancelar" onClick={() => setPromptConfig(p => ({...p, isOpen: false}))} />
            <ClassicButton label="OK" onClick={() => {
              promptConfig.onSubmit(promptConfig.value);
              setPromptConfig(p => ({...p, isOpen: false}));
            }} />
          </div>
        </div>
      </div>
    )}
    </>
  );
}
