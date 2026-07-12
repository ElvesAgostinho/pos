import React, { useState, useEffect } from 'react';
import { apiClient as axios } from '../../../api/client';
import { Users, Plus, Trash2 } from 'lucide-react';
import ClassicWindow from '../../../components/ui/ClassicWindow';
import ClassicButton from '../../../components/ui/ClassicButton';
import ClassicGrid from '../../../components/ui/ClassicGrid';
import CollaboratorWizard from './CollaboratorWizard';

const CollaboratorsList: React.FC = () => {
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const fetchCollaborators = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/workforce/collaborators/');
      setCollaborators(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchCollaborators();
  }, []);

  const handleDeleteClick = async (item: any) => {
    if (confirm(`Tem a certeza que deseja apagar o colaborador ${item.name}?`)) {
      await axios.delete(`http://localhost:8000/api/workforce/collaborators/${item.id}/`);
      fetchCollaborators();
    }
  };

  if (isWizardOpen) {
    return (
      <CollaboratorWizard 
        onComplete={() => {
          setIsWizardOpen(false);
          fetchCollaborators();
        }}
        onCancel={() => setIsWizardOpen(false)}
      />
    );
  }

  const columns = [
    { header: 'Código', accessor: 'code', width: '15%' },
    { header: 'Nome Completo', accessor: 'name', width: '35%' },
    { header: 'Email', accessor: 'email', width: '20%' },
    { header: 'Cargo', accessor: 'job_title', width: '20%' },
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
      title="Equipa e Colaboradores"
      icon={<Users size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={Plus} label="Novo Colaborador" onClick={() => setIsWizardOpen(true)} />
          </div>
          <div className="text-gray-600">
            Nº registos a visualizar: {collaborators?.length || 0}
          </div>
        </>
      }
    >
      <ClassicGrid 
        columns={columns} 
        data={collaborators || []} 
        onRowClick={(row) => console.log('Edit', row)}
      />
    </ClassicWindow>
  );
};

export default CollaboratorsList;
