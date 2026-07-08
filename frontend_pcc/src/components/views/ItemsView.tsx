import React, { useState } from 'react';
import { useItems, useCreateItem, useUpdateItem, useDeleteItem } from '../../hooks/useMdm';
import { Settings, Plus, Edit, Trash2, Save } from 'lucide-react';
import type { Item } from '../../api/mdm';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import ItemForm from '../mdm/ItemForm';
import { Can } from '../../engine/authorization';

export default function ItemsView() {
  const { data: items, isLoading } = useItems();
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();

  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  const handleAddClick = () => {
    setSelectedItem(null);
    setMode('edit');
  };

  const handleEditClick = (item: Item) => {
    setSelectedItem(item);
    setMode('edit');
  };

  const handleDeleteClick = (item: Item) => {
    if (confirm(`Tem a certeza que deseja apagar o artigo ${item.code}?`)) {
      if (item.id) deleteItem.mutate(item.id);
    }
  };

  const handleFormSubmit = (data: Partial<Item>) => {
    if (selectedItem?.id) {
      updateItem.mutate({ id: selectedItem.id, data }, {
        onSuccess: () => setMode('list')
      });
    } else {
      createItem.mutate(data, {
        onSuccess: () => setMode('list')
      });
    }
  };

  if (mode === 'edit') {
    return (
      <ClassicWindow 
        title={selectedItem ? "Editar Artigo" : "Novo Artigo"}
        icon={<Settings size={14} className="text-gray-300" />}
      >
        <div className="p-1 h-full bg-[#c0c0c0]">
           <ItemForm 
             initialData={selectedItem}
             onSubmit={handleFormSubmit}
             onCancel={() => setMode('list')}
             isLoading={createItem.isPending || updateItem.isPending}
           />
        </div>
      </ClassicWindow>
    );
  }

  const columns = [
    { header: 'Código', accessor: 'code', width: '15%' },
    { header: 'Nome do Artigo', accessor: 'name', width: '35%' },
    { header: 'Categoria', accessor: 'category_name', width: '20%' },
    { header: 'Preço Base', accessor: 'base_price', width: '10%' },
    { header: 'Taxa IVA', accessor: 'tax_percentage', width: '10%' },
    { 
      header: 'Ações', 
      accessor: (r: any) => (
        <div className="flex space-x-2">
          <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(r); }} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>
        </div>
      ), 
      width: '10%' 
    },
  ];

  return (
    <ClassicWindow 
      title="Configuração Pos"
      icon={<Settings size={14} className="text-gray-300" />}
      footer={
        <div className="flex justify-between items-center w-full px-2">
          <div className="flex items-center space-x-2 text-gray-600">
            <span>Nº registos a visualizar:</span>
            <select className="border border-gray-300 rounded-sm bg-white text-black px-1 py-0.5 outline-none">
              <option>25</option>
              <option>50</option>
              <option>100</option>
            </select>
            <div className="flex items-center space-x-1 ml-4 text-gray-400">
              <span>|◄</span>
              <span>◄</span>
              <span>Página 1 de 1</span>
              <span>►</span>
              <span>►|</span>
            </div>
            
            <div className="flex items-center space-x-4 ml-8">
              <Can action="create" resource="erp:articles" fallback={
                <div className="flex items-center space-x-1 cursor-not-allowed opacity-30" title="Sem permissão para adicionar">
                  <div className="w-5 h-5 rounded-full border-2 border-black flex items-center justify-center font-bold">+</div>
                  <span>Adicionar</span>
                </div>
              }>
                <div onClick={handleAddClick} className="flex items-center space-x-1 cursor-pointer hover:text-black">
                  <div className="w-5 h-5 rounded-full border-2 border-black flex items-center justify-center font-bold">+</div>
                  <span>Adicionar</span>
                </div>
              </Can>
              
              <Can action="edit" resource="erp:articles" fallback={
                <div className="flex items-center space-x-1 cursor-not-allowed opacity-30" title="Sem permissão para editar">
                  <div className="w-5 h-5 rounded-full border-2 border-blue-400 flex items-center justify-center text-blue-400 font-bold">/</div>
                  <span>Editar</span>
                </div>
              }>
                <div className="flex items-center space-x-1 cursor-not-allowed opacity-50">
                  <div className="w-5 h-5 rounded-full border-2 border-blue-400 flex items-center justify-center text-blue-400 font-bold">/</div>
                  <span>Editar</span>
                </div>
              </Can>

              <Can action="delete" resource="erp:articles" fallback={
                <div className="flex items-center space-x-1 cursor-not-allowed opacity-30" title="Sem permissão para apagar">
                  <div className="w-5 h-5 rounded-full bg-red-400 text-white flex items-center justify-center font-bold">-</div>
                  <span>Apagar</span>
                </div>
              }>
                <div className="flex items-center space-x-1 cursor-not-allowed opacity-50">
                  <div className="w-5 h-5 rounded-full bg-red-400 text-white flex items-center justify-center font-bold">-</div>
                  <span>Apagar</span>
                </div>
              </Can>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-gray-500">Nº registos a visualizar 1 - {items?.length || 0} de {items?.length || 0}</span>
            <div className="flex items-center space-x-1 cursor-pointer text-gray-600 hover:text-black" onClick={() => {}}>
               <div className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-xs">X</div>
               <span>Fechar</span>
            </div>
          </div>
        </div>
      }
    >
      <div className="flex flex-col h-full">
        {/* Search Bar */}
        <div className="bg-[#f5f5f5] p-1 border-b border-[#a0a0a0] flex items-center space-x-2 text-xs">
          <span>Pesquisar:</span>
          <div className="flex items-center bg-white border border-gray-300 rounded-sm h-5 px-1 w-48">
             <input type="text" className="outline-none border-none flex-1 text-xs" />
             <span className="text-gray-400 rotate-45 transform">⚲</span>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-hidden">
          <ClassicGrid 
            columns={columns} 
            data={items || []} 
            onRowClick={(row) => handleEditClick(row)}
          />
        </div>
      </div>
    </ClassicWindow>
  );
}
