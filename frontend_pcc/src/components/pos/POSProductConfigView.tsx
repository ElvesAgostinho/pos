import React, { useState } from 'react';
import { useItems } from '../../hooks/useMdm';
import { useOutlets, usePOSProfiles, useCreatePOSProfile, useUpdatePOSProfile } from '../../hooks/usePos';
import { Save, Settings } from 'lucide-react';
import type { ItemPOSProfile } from '../../api/pos';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';

export default function POSProductConfigView() {
  const { data: items } = useItems();
  const { data: outlets } = useOutlets();
  const { data: profiles } = usePOSProfiles();
  
  const createProfile = useCreatePOSProfile();
  const updateProfile = useUpdatePOSProfile();

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedOutletId, setSelectedOutletId] = useState<number | null>(null);
  
  const [activeTab, setActiveTab] = useState('ui');
  const [formData, setFormData] = useState<Partial<ItemPOSProfile> | null>(null);

  const selectedItem = items?.find(i => i.id === selectedItemId);
  const selectedOutlet = outlets?.find(o => o.id === selectedOutletId);
  const existingProfile = profiles?.find(p => p.item == selectedItemId && p.outlet == selectedOutletId);

  const handleSelectContext = (itemId: string, outletId: number) => {
    setSelectedItemId(itemId);
    setSelectedOutletId(outletId);
    
    const profile = profiles?.find(p => p.item == itemId && p.outlet == outletId);
    if (profile) {
      setFormData(profile);
    } else {
      setFormData({
        item: itemId,
        outlet: outletId,
        is_active: true,
        ui: { button_color: '#FFFFFF', visible_on_kiosk: true },
        pricing: { allow_discount: true, price: 0 },
        kitchen: { kds_priority: 'NORMAL', prep_time_minutes: 0 },
        allergens: {},
        minibar: { is_available: false, requires_refill: true, max_qty_per_room: 2 },
        delivery: { is_available_online: false, delivery_packaging_fee: 0, preparation_buffer_minutes: 15 },
        events: { is_available_events: false, min_pax: 1, max_pax: 1000, requires_advance_notice_days: 0 },
        ai: { recommendation_score: 50, is_upsell_candidate: false, learning_enabled: true, auto_suggest_pairing: true },
        fiscal: { vat_by_hotel: false, international_rules: false },
        printing: { number_of_copies: 1, print_language: 'PT-PT', auto_print: true, conditional_print: false },
        buffets: { included_in_buffet: false, price_by_weight: false, fixed_price: 0, bracelet_control: false, consumption_limit: 0 },
        bars: { is_cocktail: false },
        room_service: { is_available: false, max_time_minutes: 30, priority: 'NORMAL' },
        self_ordering: { qr_menu: true, tablet: true, kiosk: true, app: true },
        multilingual: {}
      });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (!formData) return;
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;

    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData({
        ...formData,
        [parent]: {
          ...(formData as any)[parent],
          [child]: type === 'checkbox' ? checked : value
        }
      });
    } else {
      setFormData({
        ...formData,
        [name]: type === 'checkbox' ? checked : value
      });
    }
  };

  const handleSave = () => {
    if (!formData || !selectedItemId || !selectedOutletId) return;
    if (existingProfile?.id) {
      updateProfile.mutate({ id: existingProfile.id, data: formData });
    } else {
      createProfile.mutate(formData);
    }
  };

  const tabs = [
    { id: 'ui', label: 'UX/UI' },
    { id: 'pricing', label: 'Preços' },
    { id: 'fiscal', label: 'Fiscal' },
    { id: 'kitchen', label: 'Cozinha/KDS' },
    { id: 'printing', label: 'Impressão' },
    { id: 'allergens', label: 'Nutrição' },
    { id: 'minibar', label: 'Minibar' },
    { id: 'delivery', label: 'Delivery' },
    { id: 'events', label: 'Eventos' },
    { id: 'buffets', label: 'Buffets' },
    { id: 'bars', label: 'Bares' },
    { id: 'room_service', label: 'Room Srv' },
    { id: 'self_ordering', label: 'Self-Order' },
    { id: 'multilingual', label: 'Idiomas' },
    { id: 'ai', label: 'IA' },
  ];

  const tabClass = (tab: string) => `px-3 py-1 bg-[#f0f0f0] border border-[#a0a0a0] border-b-0 -mb-[1px] text-[11px] font-sans ${activeTab === tab ? 'bg-white font-bold z-10 border-b-white' : 'cursor-pointer hover:bg-[#e8e8e8]'}`;

  return (
    <ClassicWindow 
      title="POS Product Config Center"
      icon={<Settings size={14} className="text-gray-300" />}
      footer={
        selectedItem && selectedOutlet && formData ? (
          <>
            <div className="flex items-center space-x-2">
              <ClassicButton icon={Save} label="Gravar Perfil de Artigo" onClick={handleSave} />
            </div>
            <div className="flex items-center">
            </div>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-1 h-full bg-[#f5f5f5]">
        {/* Esquerda: Matriz */}
        <div className="w-72 flex flex-col border-r border-[#a0a0a0] bg-[#e8e8e8]">
          <div className="p-2 border-b border-[#a0a0a0] font-bold text-[11px] text-[#1e3f66] flex items-center bg-[#f0f0f0]">
            <Settings size={12} className="mr-1.5" /> Seleção de Contexto
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 text-[11px]">
            {items?.map(item => (
              <div key={item.id} className="mb-2 border border-[#a0a0a0] bg-white">
                <div className="bg-[#d3e5f2] p-1 font-bold border-b border-[#a0a0a0]">{item.code} - {item.name}</div>
                <div className="p-1 space-y-0.5">
                  {outlets?.map(outlet => {
                    const isConfigured = profiles?.some(p => p.item == item.id && p.outlet == outlet.id);
                    const isSelected = selectedItemId === item.id && selectedOutletId === outlet.id;
                    
                    return (
                      <div 
                        key={outlet.id} 
                        onClick={() => handleSelectContext(item.id!, outlet.id!)}
                        className={`px-1 py-0.5 cursor-pointer flex justify-between items-center ${isSelected ? 'bg-[#c0c0c0] text-black font-bold' : 'hover:bg-[#e8e8e8]'}`}
                      >
                        <span>{outlet.name}</span>
                        {isConfigured ? <span className="text-[9px] text-green-700 font-bold">Sim</span> : <span className="text-[9px] text-gray-500">Não</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Direita: Editor */}
        <div className="flex-1 flex flex-col bg-[#e8e8e8] overflow-hidden p-2">
          {!selectedItem || !selectedOutlet || !formData ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-[11px]">
              Selecione um Artigo e um Outlet na barra lateral para configurar.
            </div>
          ) : (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              <div className="bg-white border border-[#a0a0a0] p-2 mb-2 flex-shrink-0">
                <div className="font-bold text-[12px] text-black">{selectedItem.name}</div>
                <div className="text-[11px] text-gray-600">Configuração para: <span className="font-bold text-[#1e3f66]">{selectedOutlet.name}</span></div>
              </div>

              {/* Tabs */}
              <div className="flex flex-wrap border-b border-[#a0a0a0] z-0 px-1 gap-x-0.5">
                {tabs.map(tab => (
                  <div key={tab.id} className={tabClass(tab.id)} onClick={() => setActiveTab(tab.id)}>
                    {tab.label}
                  </div>
                ))}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto bg-white border border-[#a0a0a0] border-t-0 p-3 text-[11px]">
                
                {activeTab === 'ui' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <label className="font-bold mb-1">Nome no Botão</label>
                      <input type="text" name="ui.button_name" value={formData.ui?.button_name || ''} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                    </div>
                    <div className="flex flex-col">
                      <label className="font-bold mb-1">Cor do Botão</label>
                      <input type="color" name="ui.button_color" value={formData.ui?.button_color || '#ffffff'} onChange={handleChange} className="h-6 w-full cursor-pointer border border-[#a0a0a0]" />
                    </div>
                    <div className="flex flex-col">
                      <label className="font-bold mb-1">Categoria no POS</label>
                      <input type="text" name="ui.pos_category" value={formData.ui?.pos_category || ''} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                    </div>
                    <div className="flex flex-col">
                      <label className="font-bold mb-1">Sub Categoria</label>
                      <input type="text" name="ui.pos_subcategory" value={formData.ui?.pos_subcategory || ''} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                    </div>
                    <label className="col-span-2 flex items-center space-x-2 font-bold">
                      <input type="checkbox" name="ui.visible_on_kiosk" checked={formData.ui?.visible_on_kiosk || false} onChange={handleChange} className="w-3 h-3" />
                      <span>Visível em Kiosks e Self-Service</span>
                    </label>
                  </div>
                )}

                {activeTab === 'pricing' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <label className="font-bold mb-1 text-[#1e3f66]">Preço neste Outlet (€)</label>
                      <input type="number" step="0.01" name="pricing.price" value={formData.pricing?.price || 0} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none font-bold" />
                      <span className="text-[10px] text-gray-600 mt-1">Preço base (MDM): {selectedItem.base_price}</span>
                    </div>
                    <div className="flex flex-col justify-center">
                      <label className="flex items-center space-x-2 font-bold">
                        <input type="checkbox" name="pricing.allow_discount" checked={formData.pricing?.allow_discount ?? true} onChange={handleChange} className="w-3 h-3" />
                        <span>Permite Descontos Manuais</span>
                      </label>
                    </div>
                  </div>
                )}

                {activeTab === 'kitchen' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <label className="font-bold mb-1">Impressora Principal</label>
                      <input type="text" name="kitchen.main_printer" value={formData.kitchen?.main_printer || ''} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                    </div>
                    <div className="flex flex-col">
                      <label className="font-bold mb-1">Prioridade no Ecrã KDS</label>
                      <select name="kitchen.kds_priority" value={formData.kitchen?.kds_priority || 'NORMAL'} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none">
                        <option value="LOW">Baixa</option>
                        <option value="NORMAL">Normal</option>
                        <option value="HIGH">Alta (VIP)</option>
                      </select>
                    </div>
                    <div className="flex flex-col">
                      <label className="font-bold mb-1">Tempo Ideal de Confecção (min)</label>
                      <input type="number" name="kitchen.prep_time_minutes" value={formData.kitchen?.prep_time_minutes || 0} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                    </div>
                    <div className="flex flex-col">
                      <label className="font-bold mb-1">Tempo Máximo Alerta (min)</label>
                      <input type="number" name="kitchen.max_prep_time_minutes" value={formData.kitchen?.max_prep_time_minutes || 0} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                    </div>
                  </div>
                )}

                {activeTab === 'allergens' && (
                  <div>
                    <div className="flex flex-col w-48 mb-4">
                      <label className="font-bold mb-1">Calorias (Kcal)</label>
                      <input type="number" name="allergens.calories_kcal" value={formData.allergens?.calories_kcal || 0} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                    </div>
                    <h3 className="font-bold border-b border-[#a0a0a0] pb-1 mb-2">Tabela de Alergénios e Dietas</h3>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="flex items-center space-x-2"><input type="checkbox" name="allergens.has_gluten" checked={formData.allergens?.has_gluten || false} onChange={handleChange} className="w-3 h-3"/><span>Contém Glúten</span></label>
                      <label className="flex items-center space-x-2"><input type="checkbox" name="allergens.has_lactose" checked={formData.allergens?.has_lactose || false} onChange={handleChange} className="w-3 h-3"/><span>Contém Lactose</span></label>
                      <label className="flex items-center space-x-2"><input type="checkbox" name="allergens.has_nuts" checked={formData.allergens?.has_nuts || false} onChange={handleChange} className="w-3 h-3"/><span>Frutos Casca Rija</span></label>
                      <label className="flex items-center space-x-2"><input type="checkbox" name="allergens.has_seafood" checked={formData.allergens?.has_seafood || false} onChange={handleChange} className="w-3 h-3"/><span>Marisco / Peixe</span></label>
                      <label className="flex items-center space-x-2"><input type="checkbox" name="allergens.is_vegan" checked={formData.allergens?.is_vegan || false} onChange={handleChange} className="w-3 h-3"/><span>Vegan</span></label>
                      <label className="flex items-center space-x-2"><input type="checkbox" name="allergens.is_vegetarian" checked={formData.allergens?.is_vegetarian || false} onChange={handleChange} className="w-3 h-3"/><span>Vegetariano</span></label>
                    </div>
                  </div>
                )}

                {activeTab === 'minibar' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col col-span-2">
                      <label className="flex items-center space-x-2 font-bold text-[#1e3f66]">
                        <input type="checkbox" name="minibar.is_available" checked={formData.minibar?.is_available || false} onChange={handleChange} className="w-4 h-4" />
                        <span>Disponível no Minibar</span>
                      </label>
                    </div>
                    {formData.minibar?.is_available && (
                      <>
                        <div className="flex flex-col">
                          <label className="font-bold mb-1">Quantidade Máxima (Par Level)</label>
                          <input type="number" name="minibar.max_qty_per_room" value={formData.minibar?.max_qty_per_room || 0} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                        </div>
                        <div className="flex flex-col justify-center">
                          <label className="flex items-center space-x-2 font-bold">
                            <input type="checkbox" name="minibar.requires_refill" checked={formData.minibar?.requires_refill ?? true} onChange={handleChange} className="w-3 h-3" />
                            <span>Reposição Automática (Housekeeping)</span>
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {activeTab === 'delivery' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col col-span-2">
                      <label className="flex items-center space-x-2 font-bold text-[#1e3f66]">
                        <input type="checkbox" name="delivery.is_available_online" checked={formData.delivery?.is_available_online || false} onChange={handleChange} className="w-4 h-4" />
                        <span>Ativar Venda Online / Delivery</span>
                      </label>
                    </div>
                    {formData.delivery?.is_available_online && (
                      <>
                        <div className="flex flex-col">
                          <label className="font-bold mb-1">Taxa de Embalamento (€)</label>
                          <input type="number" step="0.01" name="delivery.delivery_packaging_fee" value={formData.delivery?.delivery_packaging_fee || 0} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                        </div>
                        <div className="flex flex-col">
                          <label className="font-bold mb-1">Buffer de Preparação (min)</label>
                          <input type="number" name="delivery.preparation_buffer_minutes" value={formData.delivery?.preparation_buffer_minutes || 0} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {activeTab === 'events' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col col-span-2">
                      <label className="flex items-center space-x-2 font-bold text-[#1e3f66]">
                        <input type="checkbox" name="events.is_available_events" checked={formData.events?.is_available_events || false} onChange={handleChange} className="w-4 h-4" />
                        <span>Disponível para Menus de Eventos</span>
                      </label>
                    </div>
                    {formData.events?.is_available_events && (
                      <>
                        <div className="flex flex-col">
                          <label className="font-bold mb-1">Mínimo de PAX</label>
                          <input type="number" name="events.min_pax" value={formData.events?.min_pax || 0} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                        </div>
                        <div className="flex flex-col">
                          <label className="font-bold mb-1">Aviso Prévio (Dias)</label>
                          <input type="number" name="events.requires_advance_notice_days" value={formData.events?.requires_advance_notice_days || 0} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {activeTab === 'ai' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <label className="font-bold mb-1">Score Recomendação</label>
                      <input type="number" name="ai.recommendation_score" value={formData.ai?.recommendation_score || 0} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                    </div>
                    <div className="flex flex-col">
                      <label className="font-bold mb-1">Sugestão de Pairing</label>
                      <input type="text" name="ai.pairing_suggestion" value={formData.ai?.pairing_suggestion || ''} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                    </div>
                    <div className="flex flex-col mt-2 col-span-2">
                      <label className="flex items-center space-x-2 font-bold">
                        <input type="checkbox" name="ai.is_upsell_candidate" checked={formData.ai?.is_upsell_candidate || false} onChange={handleChange} className="w-3 h-3" />
                        <span>Candidato para Upsell Automático</span>
                      </label>
                    </div>
                  </div>
                )}

                {activeTab === 'fiscal' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <label className="font-bold mb-1">Tipo de Documento</label>
                      <input type="text" name="fiscal.document_type" value={formData.fiscal?.document_type || ''} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                    </div>
                    <div className="flex flex-col">
                      <label className="font-bold mb-1">Série de Faturação</label>
                      <input type="text" name="fiscal.billing_series" value={formData.fiscal?.billing_series || ''} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                    </div>
                    <div className="flex flex-col mt-2">
                      <label className="flex items-center space-x-2 font-bold">
                        <input type="checkbox" name="fiscal.international_rules" checked={formData.fiscal?.international_rules || false} onChange={handleChange} className="w-3 h-3" />
                        <span>Regras Fiscais Internacionais</span>
                      </label>
                    </div>
                  </div>
                )}

                {activeTab === 'printing' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <label className="font-bold mb-1">Impressora Principal</label>
                      <input type="text" name="printing.main_printer" value={formData.printing?.main_printer || ''} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                    </div>
                    <div className="flex flex-col">
                      <label className="font-bold mb-1">Nº Cópias</label>
                      <input type="number" name="printing.number_of_copies" value={formData.printing?.number_of_copies || 1} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                    </div>
                  </div>
                )}

                {activeTab === 'buffets' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col col-span-2">
                      <label className="flex items-center space-x-2 font-bold text-[#1e3f66]">
                        <input type="checkbox" name="buffets.included_in_buffet" checked={formData.buffets?.included_in_buffet || false} onChange={handleChange} className="w-4 h-4" />
                        <span>Incluído nos Buffets</span>
                      </label>
                    </div>
                    {formData.buffets?.included_in_buffet && (
                      <>
                        <div className="flex flex-col">
                          <label className="flex items-center space-x-2 font-bold mt-4">
                            <input type="checkbox" name="buffets.bracelet_control" checked={formData.buffets?.bracelet_control || false} onChange={handleChange} className="w-3 h-3" />
                            <span>Controlo por Pulseira</span>
                          </label>
                        </div>
                        <div className="flex flex-col">
                          <label className="font-bold mb-1">Limite Consumo</label>
                          <input type="number" name="buffets.consumption_limit" value={formData.buffets?.consumption_limit || 0} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {activeTab === 'bars' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col col-span-2">
                      <label className="flex items-center space-x-2 font-bold text-[#1e3f66]">
                        <input type="checkbox" name="bars.is_cocktail" checked={formData.bars?.is_cocktail || false} onChange={handleChange} className="w-4 h-4" />
                        <span>É Cocktail / Bar</span>
                      </label>
                    </div>
                    {formData.bars?.is_cocktail && (
                      <>
                        <div className="flex flex-col">
                          <label className="font-bold mb-1">Copos</label>
                          <input type="text" name="bars.glasses" value={formData.bars?.glasses || ''} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                        </div>
                        <div className="flex flex-col">
                          <label className="font-bold mb-1">Gelo</label>
                          <input type="text" name="bars.ice" value={formData.bars?.ice || ''} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {activeTab === 'room_service' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col col-span-2">
                      <label className="flex items-center space-x-2 font-bold text-[#1e3f66]">
                        <input type="checkbox" name="room_service.is_available" checked={formData.room_service?.is_available || false} onChange={handleChange} className="w-4 h-4" />
                        <span>Disponível para Room Service</span>
                      </label>
                    </div>
                    {formData.room_service?.is_available && (
                      <div className="flex flex-col">
                        <label className="font-bold mb-1">Tempo Máximo (min)</label>
                        <input type="number" name="room_service.max_time_minutes" value={formData.room_service?.max_time_minutes || 30} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'self_ordering' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <label className="flex items-center space-x-2 font-bold">
                        <input type="checkbox" name="self_ordering.qr_menu" checked={formData.self_ordering?.qr_menu ?? true} onChange={handleChange} className="w-3 h-3" />
                        <span>Visível no QR Menu</span>
                      </label>
                    </div>
                    <div className="flex flex-col">
                      <label className="flex items-center space-x-2 font-bold">
                        <input type="checkbox" name="self_ordering.kiosk" checked={formData.self_ordering?.kiosk ?? true} onChange={handleChange} className="w-3 h-3" />
                        <span>Visível nos Kiosks</span>
                      </label>
                    </div>
                  </div>
                )}

                {activeTab === 'multilingual' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col col-span-2">
                      <label className="font-bold mb-1">URL Imagem Alta Resolução</label>
                      <input type="text" name="multilingual.image_url" value={formData.multilingual?.image_url || ''} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                    </div>
                    <div className="flex flex-col">
                      <label className="font-bold mb-1">Nome Traduzido (EN)</label>
                      <input type="text" name="multilingual.translated_name" value={formData.multilingual?.translated_name || ''} onChange={handleChange} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                    </div>
                    <div className="flex flex-col col-span-2">
                      <label className="font-bold mb-1">Descrição Traduzida</label>
                      <textarea name="multilingual.translated_description" value={formData.multilingual?.translated_description || ''} onChange={(e) => handleChange(e as any)} className="border border-[#a0a0a0] p-1 focus:outline-none h-16" />
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}
        </div>
      </div>
    </ClassicWindow>
  );
}
