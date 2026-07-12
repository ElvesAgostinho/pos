import React, { useState, useEffect } from 'react';
import { apiClient as axios } from '../../api/client';
import { MonitorSmartphone, Settings2, Save } from 'lucide-react';
import ClassicWindow from '../../components/ui/ClassicWindow';
import ClassicGrid from '../../components/ui/ClassicGrid';
import ClassicButton from '../../components/ui/ClassicButton';

const TerminalsConfig: React.FC = () => {
  const [terminals, setTerminals] = useState<any[]>([]);
  const [selectedTerminal, setSelectedTerminal] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [mode, setMode] = useState<'list' | 'edit'>('list');

  const fetchTerminals = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/workforce/workstations/');
      setTerminals(res.data);
    } catch (e) {
      console.error("Error fetching workstations:", e);
    }
  };

  useEffect(() => {
    fetchTerminals();
  }, []);

  const handleEditClick = (t: any) => {
    setSelectedTerminal(t);
    setFormData(t);
    setMode('edit');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    alert("A atualização via API ainda precisa ser exposta no Django (WorkforceViewSet) com PUT.");
  };

  if (mode === 'edit') {
    return (
      <ClassicWindow 
        title={`Configurar: ${selectedTerminal.name}`}
        icon={<Settings2 size={14} className="text-gray-300" />}
        footer={
          <>
            <div className="flex items-center space-x-2">
              <ClassicButton icon={Save} label="Gravar Configuração" onClick={handleSave as any} />
            </div>
            <div className="flex items-center">
               <ClassicButton label="Voltar" onClick={() => setMode('list')} />
            </div>
          </>
        }
      >
        <div className="p-4 bg-[#f0f0f0] h-full overflow-y-auto">
          <form onSubmit={handleSave} className="text-[11px] grid grid-cols-1 gap-4">
            <div className="border border-[#a0a0a0] bg-white p-2">
              <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Detalhes do Hardware: {selectedTerminal.id}</h3>
              <div className="grid grid-cols-1 gap-y-2 max-w-md">
                <div className="flex items-center">
                  <label className="w-32 font-bold">Nome Operacional</label>
                  <input name="name" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Área</label>
                  <select name="department" value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 bg-white focus:outline-none">
                    <option value="">(Sem Área)</option>
                    <option value="Restaurante">Restaurante</option>
                    <option value="Lobby Bar">Lobby Bar</option>
                  </select>
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Impressora</label>
                  <select name="printer" value={formData.printer || ''} onChange={e => setFormData({...formData, printer: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 bg-white focus:outline-none">
                    <option value="">Nenhuma</option>
                    <option value="Epson 01">Epson 01</option>
                  </select>
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Layout</label>
                  <select name="layout" value={formData.layout || ''} onChange={e => setFormData({...formData, layout: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 bg-white focus:outline-none">
                    <option value="Touch Escuro">Touch Escuro (Industrial)</option>
                    <option value="Touch Claro">Touch Claro</option>
                  </select>
                </div>
              </div>
            </div>
          </form>
        </div>
      </ClassicWindow>
    );
  }

  const columns = [
    { header: 'ID / Hardware', accessor: 'id', width: '20%' },
    { header: 'Nome Operacional', accessor: 'name', width: '40%' },
    { header: 'IP', accessor: (r: any) => r.ip_address || 'N/A', width: '20%' },
    { header: 'Ativo', accessor: (r: any) => r.is_active ? 'Sim' : 'Não', width: '20%' },
  ];

  return (
    <ClassicWindow 
      title="Equipamentos e Terminais"
      icon={<MonitorSmartphone size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2 text-red-600 font-bold">
             Para adicionar novos terminais contacte o parceiro autorizado.
          </div>
          <div className="text-gray-600 ml-auto">
            Terminais instalados: {terminals?.length || 0}
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
};

export default TerminalsConfig;
