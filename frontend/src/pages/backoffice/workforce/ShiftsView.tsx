import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Clock, Plus, Trash2, Save } from 'lucide-react';
import ClassicWindow from '../../../components/ui/ClassicWindow';
import ClassicButton from '../../../components/ui/ClassicButton';
import ClassicGrid from '../../../components/ui/ClassicGrid';

const ShiftsView: React.FC = () => {
  const [shifts, setShifts] = useState<any[]>([]);
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [selectedShift, setSelectedShift] = useState<any>(null);
  const [formData, setFormData] = useState<any>({ name: '', start_time: '', end_time: '', hotel: 1 });

  const fetchShifts = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/workforce/shifts/');
      setShifts(res.data);
    } catch (err) {
      console.error("Error fetching shifts:", err);
    }
  };

  useEffect(() => {
    fetchShifts();
  }, []);

  const handleAddClick = () => {
    setSelectedShift(null);
    setFormData({ name: '', start_time: '08:00', end_time: '16:00', hotel: 1 });
    setMode('edit');
  };

  const handleEditClick = (item: any) => {
    setSelectedShift(item);
    setFormData(item);
    setMode('edit');
  };

  const handleDeleteClick = async (item: any) => {
    if (confirm(`Tem a certeza que deseja apagar o turno ${item.name}?`)) {
      await axios.delete(`http://localhost:8000/api/workforce/shifts/${item.id}/`);
      fetchShifts();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedShift?.id) {
        await axios.put(`http://localhost:8000/api/workforce/shifts/${selectedShift.id}/`, formData);
      } else {
        await axios.post(`http://localhost:8000/api/workforce/shifts/`, formData);
      }
      setMode('list');
      fetchShifts();
    } catch (e) {
      alert("Erro ao gravar turno");
    }
  };

  if (mode === 'edit') {
    return (
      <ClassicWindow 
        title={selectedShift ? "Editar Turno" : "Novo Turno"}
        icon={<Clock size={14} className="text-gray-300" />}
        footer={
          <>
            <div className="flex items-center space-x-2">
              <ClassicButton icon={Save} label="Gravar Turno" onClick={handleSubmit as any} />
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
              <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Horário</h3>
              <div className="grid grid-cols-1 gap-y-2 max-w-md">
                <div className="flex items-center">
                  <label className="w-32 font-bold">Nome / Ref *</label>
                  <input required name="name" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="flex-1 border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Hora Início *</label>
                  <input required type="time" name="start_time" value={formData.start_time || ''} onChange={e => setFormData({...formData, start_time: e.target.value})} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
                <div className="flex items-center">
                  <label className="w-32 font-bold">Hora Fim *</label>
                  <input required type="time" name="end_time" value={formData.end_time || ''} onChange={e => setFormData({...formData, end_time: e.target.value})} className="border border-[#a0a0a0] p-1 focus:outline-none" />
                </div>
              </div>
            </div>
          </form>
        </div>
      </ClassicWindow>
    );
  }

  const columns = [
    { header: 'Nome do Turno', accessor: 'name', width: '30%' },
    { header: 'Hora Início', accessor: 'start_time', width: '20%' },
    { header: 'Hora Fim', accessor: 'end_time', width: '20%' },
    { header: 'Hotel ID', accessor: 'hotel', width: '20%' },
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
      title="Gestão de Turnos"
      icon={<Clock size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={Plus} label="Novo Turno" onClick={handleAddClick} />
          </div>
          <div className="text-gray-600">
            Nº registos a visualizar: {shifts?.length || 0}
          </div>
        </>
      }
    >
      <ClassicGrid 
        columns={columns} 
        data={shifts || []} 
        onRowClick={(row) => handleEditClick(row)}
      />
    </ClassicWindow>
  );
};

export default ShiftsView;
