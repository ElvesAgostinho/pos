import React, { useState, useEffect } from 'react';
import type { Item } from '../../api/mdm';
import { useCategories, useTaxes, useUoms, useBrands, useSuppliers } from '../../hooks/useMdm';
import { Save, XCircle } from 'lucide-react';

interface ItemFormProps {
  initialData?: Item | null;
  onSubmit: (data: Partial<Item>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function ItemForm({ initialData, onSubmit, onCancel, isLoading }: ItemFormProps) {
  const [activeTab, setActiveTab] = useState('identification');

  const [formData, setFormData] = useState<any>({
    code: '',
    name: '',
    description: '',
    item_type: 'PHYSICAL',
    is_active: true,
    is_sellable: true,
    is_purchasable: true,
    base_price: '0.00',
    cost_price: '0.00',
    category: '',
    tax: '',
    uom: '',
    brand: '',
    supplier: '',
    
    // Nested objects
    purchasing: {
      supplier_code: '', lead_time_days: 0, min_order_qty: 1.0, max_order_qty: 9999.0,
      purchase_multiple: 1.0, last_cost: 0.0, average_cost: 0.0
    },
    stock_params: {
      is_inventoriable: true, manages_stock: true, manages_batches: false,
      manages_expiry: false, manages_serial: false, allow_negative_stock: false,
      min_stock: 0.0, max_stock: 9999.0, safety_stock: 0.0, weight_kg: 0.0, volume_m3: 0.0
    },
    pricing: {
    },
    fiscal: {
      tax_exemption_code: '', tax_exemption_reason: '', accounting_account: '', cost_center: ''
    }
  });

  const { data: categories } = useCategories();
  const { data: taxes } = useTaxes();
  const { data: uoms } = useUoms();
  const { data: brands } = useBrands();
  const { data: suppliers } = useSuppliers();

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...formData,
        ...initialData,
        category: initialData.category || '',
        tax: initialData.tax || '',
        uom: initialData.uom || '',
        brand: initialData.brand || '',
        supplier: initialData.supplier || '',
        purchasing: initialData.purchasing || formData.purchasing,
        stock_params: initialData.stock_params || formData.stock_params,
        pricing: initialData.pricing || formData.pricing,
        fiscal: initialData.fiscal || formData.fiscal,
      });
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    // Check if it's a nested field (e.g. hospitality.available_restaurant)
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData((prev: any) => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
        }
      }));
    } else {
      setFormData((prev: any) => ({ 
        ...prev, 
        [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value 
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.code || formData.code.trim() === '') {
      alert('O Código Interno é obrigatório.');
      setActiveTab('identification');
      return;
    }
    if (!formData.name || formData.name.trim() === '') {
      alert('O Nome Comercial é obrigatório.');
      setActiveTab('identification');
      return;
    }
    if (!formData.tax) {
      alert('A Taxa de IVA é obrigatória. Por favor selecione na tab "Preços base".');
      setActiveTab('prices');
      return;
    }

    const payload = {
      ...formData,
      category: formData.category || null,
      tax: formData.tax || null,
      uom: formData.uom || null,
      brand: formData.brand || null,
      supplier: formData.supplier || null,
    };
    onSubmit(payload);
  };

  const tabs = [
    { id: 'identification', label: '1 - Identificação' },
    { id: 'classification', label: '2 - Classificação' },
    { id: 'prices', label: '3 - Preços base' },
    { id: 'stock', label: '5 - Compras & Stock' },
    { id: 'fiscal', label: '6 - Fiscal' },
  ];

  return (
    <form onSubmit={handleSubmit} className="text-[11px] font-sans h-full flex flex-col" style={{height: '500px'}}>
      {/* Tab Headers */}
      <div className="flex border-b border-[#ccc] bg-[#f0f0f0] pt-1 px-1">
        {tabs.map(t => (
          <div 
            key={t.id} 
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1 mr-1 border border-b-0 cursor-pointer rounded-t-sm
              ${activeTab === t.id ? 'bg-white border-[#ccc] font-bold z-10 -mb-[1px]' : 'bg-[#e4e4e4] border-transparent text-gray-600 hover:bg-[#e8e8e8]'}
            `}
          >
            {t.label}
          </div>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 bg-white border border-t-0 border-[#ccc] p-3 overflow-y-auto">
        {activeTab === 'identification' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 grid grid-cols-4 gap-2 items-center">
              <label className="text-right pr-2">Código Interno:</label>
              <input name="code" value={formData.code} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 outline-none focus:border-blue-500 w-full col-span-1" />
              
              <label className="text-right pr-2">Tipo de Artigo:</label>
              <select name="item_type" value={formData.item_type} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 outline-none w-full col-span-1">
                <option value="PHYSICAL">Produto Físico</option>
                <option value="SERVICE">Serviço</option>
                <option value="ROOM">Quarto de Hotel</option>
                <option value="FB">Alimentação & Bebidas</option>
              </select>

              <label className="text-right pr-2 mt-1">Nome Comercial:</label>
              <input name="name" value={formData.name} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 outline-none focus:border-blue-500 w-full col-span-3 mt-1" />
              
              <label className="text-right pr-2 mt-1">Descrição Completa:</label>
              <input name="description" value={formData.description} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 outline-none focus:border-blue-500 w-full col-span-3 mt-1" />
            </div>

            <div className="col-span-2 flex space-x-6 mt-4 p-2 border border-gray-200 bg-gray-50">
              <label className="flex items-center space-x-1"><input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleChange} /><span>Artigo Ativo</span></label>
              <label className="flex items-center space-x-1"><input type="checkbox" name="is_sellable" checked={formData.is_sellable} onChange={handleChange} /><span>Disponível para Venda</span></label>
              <label className="flex items-center space-x-1"><input type="checkbox" name="is_purchasable" checked={formData.is_purchasable} onChange={handleChange} /><span>Disponível para Compra</span></label>
            </div>
          </div>
        )}

        {activeTab === 'classification' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 grid grid-cols-4 gap-2 items-center">
              <label className="text-right pr-2">Categoria:</label>
              <select name="category" value={formData.category} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 outline-none w-full col-span-1">
                <option value="">(Nenhuma)</option>
                {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              <label className="text-right pr-2">Marca:</label>
              <select name="brand" value={formData.brand} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 outline-none w-full col-span-1">
                <option value="">(Nenhuma)</option>
                {brands?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {activeTab === 'prices' && (
          <div className="grid grid-cols-2 gap-4">
             <div className="col-span-2 grid grid-cols-4 gap-2 items-center">
              <label className="text-right pr-2 font-bold text-red-600">Taxa IVA:</label>
              <select name="tax" value={formData.tax} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 outline-none w-full col-span-1">
                <option value="">(Selecione...)</option>
                {taxes?.map(t => <option key={t.id} value={t.id}>{t.name} ({t.percentage}%)</option>)}
              </select>
              
              <div className="col-span-2"></div>

              <label className="text-right pr-2 mt-1">Preço Base (PVP):</label>
              <input type="number" step="0.01" name="base_price" value={formData.base_price} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 outline-none w-full col-span-1 mt-1 text-right" />

              <label className="text-right pr-2 mt-1">Custo Padrão:</label>
              <input type="number" step="0.01" name="cost_price" value={formData.cost_price} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 outline-none w-full col-span-1 mt-1 text-right" />
            </div>

          </div>
        )}

        {activeTab === 'stock' && (
          <div className="grid grid-cols-2 gap-4">
             <div className="col-span-2">
               <h4 className="font-bold mb-2 border-b pb-1">Compras</h4>
               <div className="grid grid-cols-4 gap-2 items-center">
                  <label className="text-right pr-2">Fornecedor Princ.:</label>
                  <select name="supplier" value={formData.supplier} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 outline-none w-full col-span-1">
                    <option value="">(Nenhum)</option>
                    {suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <label className="text-right pr-2">Cód. Fornecedor:</label>
                  <input name="purchasing.supplier_code" value={formData.purchasing.supplier_code} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 w-full" />
                  
                  <label className="text-right pr-2 mt-1">Lead Time (dias):</label>
                  <input type="number" name="purchasing.lead_time_days" value={formData.purchasing.lead_time_days} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 w-full mt-1" />
                  <label className="text-right pr-2 mt-1">Múltiplo Compra:</label>
                  <input type="number" step="0.01" name="purchasing.purchase_multiple" value={formData.purchasing.purchase_multiple} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 w-full mt-1" />
               </div>
             </div>

             <div className="col-span-2 mt-2">
               <h4 className="font-bold mb-2 border-b pb-1">Gestão de Stock</h4>
               <div className="flex space-x-6 p-2 bg-gray-50 mb-2">
                  <label className="flex items-center space-x-1"><input type="checkbox" name="stock_params.is_inventoriable" checked={formData.stock_params.is_inventoriable} onChange={handleChange} /><span>É Inventariável</span></label>
                  <label className="flex items-center space-x-1"><input type="checkbox" name="stock_params.manages_stock" checked={formData.stock_params.manages_stock} onChange={handleChange} /><span>Gere Stock</span></label>
                  <label className="flex items-center space-x-1"><input type="checkbox" name="stock_params.manages_batches" checked={formData.stock_params.manages_batches} onChange={handleChange} /><span>Gere Lotes/Validade</span></label>
               </div>
               
               <div className="grid grid-cols-4 gap-2 items-center">
                  <label className="text-right pr-2">Unid. Medida:</label>
                  <select name="uom" value={formData.uom} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 outline-none w-full col-span-1">
                    <option value="">(Nenhuma)</option>
                    {uoms?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <label className="text-right pr-2">Stock Mínimo:</label>
                  <input type="number" step="0.01" name="stock_params.min_stock" value={formData.stock_params.min_stock} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 w-full" />
                  
                  <label className="text-right pr-2 mt-1">Stock Máximo:</label>
                  <input type="number" step="0.01" name="stock_params.max_stock" value={formData.stock_params.max_stock} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 w-full mt-1" />
                  <label className="text-right pr-2 mt-1">Peso (Kg):</label>
                  <input type="number" step="0.01" name="stock_params.weight_kg" value={formData.stock_params.weight_kg} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 w-full mt-1" />
               </div>
             </div>
          </div>
        )}

        {activeTab === 'fiscal' && (
           <div className="grid grid-cols-4 gap-2 items-center">
              <label className="text-right pr-2">Motivo Isenção:</label>
              <input name="fiscal.tax_exemption_reason" value={formData.fiscal.tax_exemption_reason} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 w-full col-span-3" placeholder="Ex: M01 - Artigo 16º nº 6 do CIVA" />
              
              <label className="text-right pr-2 mt-1">Conta Contabilística:</label>
              <input name="fiscal.accounting_account" value={formData.fiscal.accounting_account} onChange={handleChange} className="border border-[#ccc] px-1 py-0.5 w-full col-span-1 mt-1" placeholder="Ex: 711111" />
           </div>
        )}
      </div>

      {/* Footer / Botões de Ação */}
      <div className="mt-2 pt-3 border-t border-[#d0d0d0] flex justify-end space-x-2">
        <button type="button" onClick={onCancel} disabled={isLoading} className="flex items-center space-x-1 border border-gray-400 bg-white px-3 py-1 hover:bg-gray-100">
          <XCircle size={14} className="text-red-500" />
          <span>Cancelar</span>
        </button>
        <button type="submit" disabled={isLoading} className="flex items-center space-x-1 border border-gray-400 bg-[#e0e0e0] px-3 py-1 hover:bg-[#d0d0d0] font-bold">
          <Save size={14} className="text-blue-600" />
          <span>{isLoading ? 'A gravar...' : 'Gravar Artigo'}</span>
        </button>
      </div>
    </form>
  );
}
