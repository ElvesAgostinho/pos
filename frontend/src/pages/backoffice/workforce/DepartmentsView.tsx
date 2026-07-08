import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Building, Plus, Trash2, Save } from 'lucide-react';
import ClassicWindow from '../../../components/ui/ClassicWindow';
import ClassicButton from '../../../components/ui/ClassicButton';
import ClassicGrid from '../../../components/ui/ClassicGrid';

const DepartmentsView: React.FC = () => {
  const [departments, setDepartments] = useState<any[]>([]);
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [selectedDept, setSelectedDept] = useState<any>(null);
  const [formData, setFormData] = useState<any>({ name: '', description: '', hotel: 1 });

  const fetchDepartments = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/workforce/departments/');
      setDepartments(res.data);
    } catch (err) {
      console.error("Error fetching departments:", err);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const handleAddClick = () => {
    setSelectedDept(null);
    setFormData({ name: '', description: '', hotel: 1 });
    setMode('edit');
  };

  const handleEditClick = (item: any) => {
    setSelectedDept(item);
    setFormData(item);
    setMode('edit');
  };

  const handleDeleteClick = async (item: any) => {
    if (confirm(`Tem a certeza que deseja apagar o departamento ${item.name}?`)) {
      await axios.delete(`http://localhost:8000/api/workforce/departments/${item.id}/`);
      fetchDepartments();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedDept?.id) {
        await axios.put(`http://localhost:8000/api/workforce/departments/${selectedDept.id}/`, formData);
      } else {
        await axios.post(`http://localhost:8000/api/workforce/departments/`, formData);
      }
      setMode('list');
      fetchDepartments();
    } catch (e) {
      alert("Erro ao gravar departamento");
    }
  };

  if (mode === 'edit') {
    return (
      <ClassicWindow 
        title={selectedDept ? "Editar Departamento" : "Novo Departamento"}
        icon={<Building size={14} className="text-gray-300" />}
        footer={
          <>
            <div className="flex items-center space-x-2">
              <ClassicButton icon={Save} label="Gravar Departamento" onClick={handleSubmit as any} />
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
              <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Detalhes</h3>
              <div className="grid grid-cols-1 gap-y-2 max-w-md">
                <div className="flex items-center">
                  <label className="w-32 font-bold">Nome *</label>
                  <input required name="name" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Descrição</label>
                  <input name="description" value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
              </div>
            </div>
          </form>
        </div>
      </ClassicWindow>
    );
  }

  const columns = [
    { header: 'Nome', accessor: 'name', width: '30%' },
    { header: 'Descrição', accessor: 'description', width: '50%' },
    { header: 'Hotel ID', accessor: 'hotel', width: '10%' },
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
      title="Gestão de Departamentos & Áreas"
      icon={<Building size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={Plus} label="Novo Departamento" onClick={handleAddClick} />
          </div>
          <div className="text-gray-600">
            Nº registos a visualizar: {departments?.length || 0}
          </div>
        </>
      }
    >
      <ClassicGrid 
        columns={columns} 
        data={departments || []} 
        onRowClick={(row) => handleEditClick(row)}
      />
    </ClassicWindow>
  );
};

export default DepartmentsView;
