import React, { useEffect, useState } from 'react';
import { apiClient as axios } from '../api/client';
import { Pencil } from 'lucide-react';

const Dashboard: React.FC = () => {
  const [clients, setClients] = useState<any[]>([]);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const res = await axios.get('http://localhost:8000/api/clm/clients/');
        setClients(res.data);
      } catch (err) {
        console.error("Error fetching clients:", err);
      }
    };
    fetchClients();
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#f0f0f0] text-black font-sans text-[11px] select-none">
      
      {/* Top Search Bar */}
      <div className="flex items-center px-2 py-1 bg-[#e0e0e0] border-b border-[#a0a0a0]">
        <span className="mr-2 text-gray-700">Pesquisar:</span>
        <div className="flex bg-white border border-[#999] h-[18px]">
          <input type="text" className="px-1 text-[11px] outline-none w-48" />
          <button className="bg-[#eee] px-1 border-l border-[#999] hover:bg-[#ddd]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 bg-white overflow-auto border-b border-[#a0a0a0]">
        <table className="w-full text-left border-collapse cursor-default">
          <thead>
            <tr className="bg-gradient-to-b from-[#ffffff] to-[#e0e0e0] border-b border-[#a0a0a0] text-gray-700">
              <th className="py-1 px-2 border-r border-[#ccc] font-normal w-24">Código</th>
              <th className="py-1 px-2 border-r border-[#ccc] font-normal">Nome do Cliente / Entidade</th>
              <th className="py-1 px-2 border-r border-[#ccc] font-normal w-48 text-center">Ativo</th>
              <th className="py-1 px-2 font-normal w-64">Módulos</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client, i) => (
              <tr key={client.id || i} className={`border-b border-[#eee] hover:bg-[#cce8ff] ${i === 0 ? 'bg-[#cce8ff]' : ''}`}>
                <td className="py-1 px-2 border-r border-[#eee]">{client.code}</td>
                <td className="py-1 px-2 border-r border-[#eee]">{client.commercial_name}</td>
                <td className="py-1 px-2 border-r border-[#eee] text-center">
                  {client.status === 'ACTIVE' ? (
                    <span className="text-green-600 font-bold text-sm leading-none">✓</span>
                  ) : null}
                </td>
                <td className="py-1 px-2">{client.client_type}</td>
              </tr>
            ))}
            {/* Empty rows to fill space */}
            {Array.from({ length: Math.max(0, 15 - clients.length) }).map((_, i) => (
              <tr key={`empty-${i}`} className="border-b border-[#eee]">
                <td className="py-3 px-2 border-r border-[#eee]"></td>
                <td className="py-3 px-2 border-r border-[#eee]"></td>
                <td className="py-3 px-2 border-r border-[#eee]"></td>
                <td className="py-3 px-2"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Controls (System Toolbar Style) */}
      <div className="bg-[#e0e0e0] flex justify-between items-center text-[11px]">
        {/* Pagination */}
        <div className="flex items-center px-2 py-1 border-r border-[#a0a0a0] border-b border-b-[#a0a0a0] w-full">
          <div className="flex space-x-1 mr-4">
            <button className="px-1 text-gray-400 hover:text-black">|&lt;</button>
            <button className="px-1 text-gray-400 hover:text-black">&lt;</button>
            <span className="px-2">Página <input type="text" className="w-6 text-center border border-[#999] mx-1 h-[16px]" defaultValue="1" /> de 1</span>
            <button className="px-1 text-gray-400 hover:text-black">&gt;</button>
            <button className="px-1 text-gray-400 hover:text-black">&gt;|</button>
          </div>
          <div className="flex-1 text-right text-gray-500 mr-2">
            Nº registos a visualizar 1 - 4 de 4
          </div>
        </div>
      </div>
      
      <div className="bg-[#e0e0e0] border-t border-white p-1 flex justify-between items-center text-[11px] h-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        <div className="flex space-x-4 px-2">
          <button className="flex items-center space-x-1 hover:bg-[#d0d0d0] px-2 py-1 rounded">
            <div className="w-5 h-5 rounded-full border border-[#333] flex justify-center items-center font-bold bg-white text-black pb-[2px]">
              +
            </div>
            <span className="text-gray-700 ml-1">Adicionar</span>
          </button>
          
          <button className="flex items-center space-x-1 hover:bg-[#d0d0d0] px-2 py-1 rounded">
            <div className="w-5 h-5 rounded-full border border-transparent flex justify-center items-center bg-[#5bc0de] text-white">
              <Pencil size={10} />
            </div>
            <span className="text-gray-700 ml-1">Editar</span>
          </button>
          
          <button className="flex items-center space-x-1 hover:bg-[#d0d0d0] px-2 py-1 rounded">
            <div className="w-5 h-5 rounded-full border border-transparent flex justify-center items-center bg-[#d9534f] text-white font-bold pb-[2px]">
              -
            </div>
            <span className="text-gray-700 ml-1">Apagar</span>
          </button>
        </div>

        <div className="flex items-center px-2">
          <button className="flex items-center space-x-1 hover:bg-[#d0d0d0] px-2 py-1 rounded">
            <div className="w-5 h-5 rounded-full border-2 border-[#333] flex justify-center items-center bg-[#f0ad4e] text-black font-bold pb-[2px]">
              x
            </div>
            <span className="text-gray-700 font-medium ml-1">Fechar</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
