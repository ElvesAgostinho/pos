import React, { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicGrid from '../ui/ClassicGrid';
import ClassicButton from '../ui/ClassicButton';
import { RefreshCw, Search, FileDown } from 'lucide-react';
import { useStockLevels } from '../../hooks/useWms';

export default function StockLevelsView() {
  const { data: stockLevels, isLoading, refetch } = useStockLevels();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLevels = stockLevels?.filter(level => 
    level.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    level.location_full_code?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const columns = [
    { header: 'Artigo', accessor: 'item_name', width: '25%' },
    { header: 'Cód. Artigo', accessor: 'item_code', width: '10%' },
    { header: 'Localização', accessor: 'location_full_code', width: '20%' },
    { header: 'Lote', accessor: 'batch_number', width: '15%' },
    { header: 'Validade', accessor: 'expiry_date', width: '10%' },
    { header: 'Qtd. Fís.', accessor: 'quantity', width: '10%' },
    { header: 'Qtd. Rsv.', accessor: 'reserved_quantity', width: '10%' },
  ];

  return (
    <ClassicWindow 
      title="Consulta de Níveis de Stock"
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={RefreshCw} label="Atualizar" onClick={() => refetch()} />
            <ClassicButton icon={FileDown} label="Exportar para Excel" />
          </div>
          <div className="text-gray-600">
            Nº registos a visualizar: {filteredLevels.length}
          </div>
        </>
      }
    >
      <div className="flex flex-col h-full">
        {/* Filtros */}
        <div className="bg-[#f0f0f0] border-b border-[#a0a0a0] p-2 flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-gray-700">Pesquisa livre:</label>
            <div className="relative">
              <input 
                type="text" 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="border border-[#a0a0a0] px-2 py-0.5 w-64 focus:outline-none"
              />
              <Search size={12} className="absolute right-2 top-1.5 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Grelha */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500">A carregar saldos...</div>
          ) : (
            <ClassicGrid columns={columns} data={filteredLevels} />
          )}
        </div>
      </div>
    </ClassicWindow>
  );
}
