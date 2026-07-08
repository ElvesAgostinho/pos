import React, { useState } from 'react';
import { Minus, Plus, Database, Settings } from 'lucide-react';

interface SidebarProps {
  activeView?: string;
  onSelectView?: (view: string) => void;
}

export default function Sidebar({ activeView = 'items', onSelectView }: SidebarProps) {
  const [mdmOpen, setMdmOpen] = useState(true);
  const [parametrosOpen, setParametrosOpen] = useState(true);
  const [posOpen, setPosOpen] = useState(true);
  const [supplyChainOpen, setSupplyChainOpen] = useState(true);

  const supplyChainItems = [
    { name: 'Gestão de Inventário', id: 'inventory_dashboard' },
    { name: 'Fichas Técnicas (Receitas)', id: 'inventory_recipes' },
    { name: 'Níveis de Stock', id: 'inventory_stock' },
    { name: 'Gestão de Fornecedores', id: 'procurement_suppliers' },
    { name: 'Purchase Orders (POs)', id: 'procurement_pos' },
    { name: 'Receção de Mercadorias (GRNs)', id: 'procurement_grns' },
  ];

  const posItems = [
    { name: 'Pontos de Venda (Outlets)', id: 'outlets' },
    { name: 'Terminais POS', id: 'pos_terminals' },
    { name: 'POS Product Config Center', id: 'pos_product_config' },
    { name: 'Motor de Operação (Config)', id: 'operation_config' },
  ];

  const mdmItems = [
    { name: 'Dashboard MDM', id: 'dashboard' },
    { name: 'Artigos', id: 'items' },
    { name: 'Categorias (Engine)', id: 'categories' },
    { name: 'Marcas & Fabricantes', id: 'brands' },
    { name: 'Fornecedores', id: 'suppliers' },
    { name: 'Impostos (IVA)', id: 'taxes' },
    { name: 'Unidades de Medida', id: 'uoms' },
  ];

  const wmsItems = [
    { name: 'Armazéns', id: 'warehouses' },
    { name: 'Localizações', id: 'locations' },
    { name: 'Fichas Técnicas (BOM)', id: 'bom' },
    { name: 'Zonas', id: 'zones' },
    { name: 'Corredores', id: 'aisles' },
    { name: 'Estantes', id: 'racks' },
    { name: 'Prateleiras', id: 'shelves' },
    { name: 'Níveis de Stock', id: 'stock_levels' },
    { name: 'Movimentos de Stock', id: 'stock_movements' },
  ];

  const renderSection = (title: string, items: {name: string, id: string}[], isOpen: boolean, setOpen: (v: boolean) => void) => (
    <div className="mb-0">
      <div 
        className="flex items-center px-2 py-1 bg-[#f0f0f0] border-b border-[#d0d0d0] border-t border-t-[#ffffff] cursor-pointer hover:bg-[#e8e8e8]"
        onClick={() => setOpen(!isOpen)}
      >
        <span className="mr-2 text-gray-500 font-monospace text-xs w-3 text-center">{isOpen ? '-' : '+'}</span>
        <span className="text-[#333333] text-[11px] flex-1 font-medium">{title}</span>
      </div>
      
      {isOpen && (
        <div className="py-0 bg-white">
          {items.map((item) => {
            const isActive = activeView === item.id;
            return (
              <div 
                key={item.id} 
                onClick={() => onSelectView && onSelectView(item.id)}
                className={`flex items-center px-6 py-1 cursor-pointer border-b border-transparent ${isActive ? 'bg-[#cce8ff] border-b-[#99ccff]' : 'hover:bg-[#f5f5f5]'}`}
              >
                <div className="w-1 h-1 rounded-full bg-gray-600 mr-2"></div>
                <span className={isActive ? 'text-black' : 'text-gray-800'}>{item.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const hrItems = [
    { name: 'Colaboradores', id: 'hr_collaborators' },
    { name: 'Operadores POS', id: 'hr_pos_operators' },
    { name: 'Gestão de Turnos', id: 'hr_shifts' },
    { name: 'Departamentos & Áreas', id: 'hr_departments' },
  ];

  const authItems = [
    { name: 'Perfis de Segurança (RBAC)', id: 'auth_roles' },
    { name: 'Matriz de Permissões', id: 'auth_matrix' },
    { name: 'Regras de Contexto (ABAC)', id: 'auth_abac' },
  ];

  return (
    <div className="w-56 bg-[#f0f0f0] border-r border-[#a0a0a0] flex flex-col text-[11px] font-sans select-none overflow-y-auto">
      {renderSection('Master Data', mdmItems, mdmOpen, setMdmOpen)}
      {renderSection('Supply Chain & Procurement', supplyChainItems, supplyChainOpen, setSupplyChainOpen)}
      {renderSection('Warehouse Management', wmsItems, parametrosOpen, setParametrosOpen)}
      {renderSection('POS Configuration', posItems, posOpen, setPosOpen)}
      {renderSection('Recursos Humanos', hrItems, true, () => {})}
      {renderSection('Gestão de Segurança', authItems, true, () => {})}
    </div>
  );
}
