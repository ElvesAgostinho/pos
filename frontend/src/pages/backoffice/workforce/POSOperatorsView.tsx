import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ShieldCheck, Plus, Trash2, Save } from 'lucide-react';
import ClassicWindow from '../../../components/ui/ClassicWindow';
import ClassicButton from '../../../components/ui/ClassicButton';
import ClassicGrid from '../../../components/ui/ClassicGrid';

const POSOperatorsView: React.FC = () => {
  const [operators, setOperators] = useState<any[]>([]);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [selectedOp, setSelectedOp] = useState<any>(null);
  const [formData, setFormData] = useState<any>({ collaborator: '', name: '', pin_code: '', is_active: true });

  const fetchData = async () => {
    try {
      const [opsRes, collabsRes] = await Promise.all([
        axios.get('http://localhost:8000/api/workforce/pos_operators/'),
        axios.get('http://localhost:8000/api/workforce/collaborators/')
      ]);
      setOperators(opsRes.data);
      setCollaborators(collabsRes.data);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddClick = () => {
    setSelectedOp(null);
    setFormData({ collaborator: '', name: '', pin_code: '', is_active: true });
    setMode('edit');
  };

  const handleEditClick = (item: any) => {
    setSelectedOp(item);
    setFormData(item);
    setMode('edit');
  };

  const handleDeleteClick = async (item: any) => {
    if (confirm(`Tem a certeza que deseja remover o operador POS ${item.name}?`)) {
      await axios.delete(`http://localhost:8000/api/workforce/pos_operators/${item.id}/`);
      fetchData();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedOp?.id) {
        await axios.put(`http://localhost:8000/api/workforce/pos_operators/${selectedOp.id}/`, formData);
      } else {
        await axios.post(`http://localhost:8000/api/workforce/pos_operators/`, formData);
      }
      setMode('list');
      fetchData();
    } catch (e) {
      alert("Erro ao gravar operador POS. Verifique se escolheu um colaborador.");
    }
  };

  if (mode === 'edit') {
    return (
      <ClassicWindow 
        title={selectedOp ? "Editar Operador POS" : "Novo Operador POS"}
        icon={<ShieldCheck size={14} className="text-gray-300" />}
        footer={
          <>
            <div className="flex items-center space-x-2">
              <ClassicButton icon={Save} label="Gravar Operador" onClick={handleSubmit as any} />
            </div>
            <div className="flex items-center">
               <ClassicButton label="Cancelar" onClick={() => setMode('list')} />
            </div>
          </>
        }
      >
        <div className="p-4 bg-[#f0f0f0] h-full overflow-y-auto">
          <form onSubmit={handleSubmit} className="text-[11px] grid grid-cols-1 gap-4">
            <div className="border border-[#a0a0a0] bg-white p-2">
              <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Identificação na Frente de Loja</h3>
              <div className="grid grid-cols-1 gap-y-2 max-w-md">
                <div className="flex items-center">
                  <label className="w-40 font-bold">Colaborador Associado *</label>
                  <select required name="collaborator" value={formData.collaborator || ''} onChange={e => setFormData({...formData, collaborator: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 bg-white focus:outline-none">
                    <option value="">(Selecione)</option>
                    {collaborators.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                  </select>
                </div>
                <div className="flex items-center">
                  <label className="w-40 font-bold">Nome de Ecrã / Talão *</label>
                  <input required name="name" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-40 font-bold">PIN de Acesso *</label>
                  <input required type="password" maxLength={6} name="pin_code" value={formData.pin_code || ''} onChange={e => setFormData({...formData, pin_code: e.target.value})} className="w-24 text-center tracking-widest border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center mt-2">
                  <input type="checkbox" name="is_active" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} className="mr-2" />
                  <label className="font-bold">Operador Ativo no POS</label>
                </div>
              </div>
            </div>
          </form>
        </div>
      </ClassicWindow>
    );
  }

  const columns = [
    { header: 'ID Operador', accessor: 'id', width: '15%' },
    { header: 'Nome de Ecrã / Talão', accessor: 'name', width: '40%' },
    { header: 'PIN (Hashed)', accessor: 'pin_code', width: '25%' },
    { header: 'Estado', accessor: (r: any) => r.is_active ? 'Ativo' : 'Inativo', width: '10%' },
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
      title="Gestão de Operadores POS"
      icon={<ShieldCheck size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={Plus} label="Novo Operador" onClick={handleAddClick} />
          </div>
          <div className="text-gray-600">
            Nº registos a visualizar: {operators?.length || 0}
          </div>
        </>
      }
    >
      <ClassicGrid 
        columns={columns} 
        data={operators || []} 
        onRowClick={(row) => handleEditClick(row)}
      />
    </ClassicWindow>
  );
};

export default POSOperatorsView;
