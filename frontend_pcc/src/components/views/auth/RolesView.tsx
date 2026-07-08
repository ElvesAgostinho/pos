import React, { useState } from 'react';
import ClassicWindow from '../../ui/ClassicWindow';
import ClassicGrid from '../../ui/ClassicGrid';
import ClassicButton from '../../ui/ClassicButton';
import { Shield, Plus, Edit, Trash2, Save, CheckCircle } from 'lucide-react';
import { useProfiles, useCreateProfile, useUpdateProfile, useDeleteProfile } from '../../../hooks/useEae';
import type { EaeProfile } from '../../../api/eae';

const RolesView: React.FC = () => {
  const { data: profiles, isLoading } = useProfiles();
  const createProfile = useCreateProfile();
  const updateProfile = useUpdateProfile();
  const deleteProfile = useDeleteProfile();

  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [selectedProfile, setSelectedProfile] = useState<EaeProfile | null>(null);
  const [formData, setFormData] = useState<Partial<EaeProfile>>({});

  const handleCreate = () => {
    setSelectedProfile(null);
    setFormData({ status: 'Active', category: 'Operação', is_global: true });
    setMode('create');
  };

  const handleEdit = () => {
    if (selectedProfile) {
      setFormData(selectedProfile);
      setMode('edit');
    }
  };

  const handleDelete = async () => {
    if (selectedProfile && window.confirm(`Tem a certeza que deseja eliminar o perfil ${selectedProfile.name}?`)) {
      try {
        await deleteProfile.mutateAsync(selectedProfile.id);
        setSelectedProfile(null);
      } catch (e) {
        alert('Erro ao eliminar perfil.');
      }
    }
  };

  const handleSave = async () => {
    try {
      if (mode === 'create') {
        await createProfile.mutateAsync(formData);
      } else if (mode === 'edit' && selectedProfile) {
        await updateProfile.mutateAsync({ id: selectedProfile.id, data: formData });
      }
      setMode('list');
    } catch (e) {
      alert('Erro ao gravar perfil.');
    }
  };

  const columns = [
    { header: 'ID / Código', accessor: 'code', width: '20%' },
    { header: 'Nome do Perfil', accessor: 'name', width: '30%' },
    { header: 'Categoria', accessor: 'category', width: '20%' },
    { header: 'Estado', accessor: 'status', width: '15%' },
    { header: 'Global?', accessor: (r: any) => r.is_global ? 'Sim' : 'Não', width: '15%' },
  ];

  if (mode === 'create' || mode === 'edit') {
    return (
      <ClassicWindow 
        title={mode === 'create' ? "Novo Perfil de Segurança" : "Editar Perfil"} 
        icon={<Shield size={14} className="text-gray-300" />}
        footer={
          <>
            <div className="flex space-x-2">
              <ClassicButton icon={Save} label="Gravar" onClick={handleSave} />
            </div>
            <div>
              <ClassicButton icon={CheckCircle} label="Cancelar" onClick={() => setMode('list')} />
            </div>
          </>
        }
      >
        <div className="p-4 bg-[#f0f0f0] h-full flex flex-col">
          <div className="bg-white border border-[#a0a0a0] p-4 flex flex-col space-y-3">
            <div className="flex space-x-4">
              <div className="w-1/3">
                <label className="block text-gray-700 font-bold mb-1 text-[11px]">Código</label>
                <input 
                  type="text" 
                  value={formData.code || ''}
                  onChange={e => setFormData({...formData, code: e.target.value})}
                  className="w-full border border-[#a0a0a0] px-2 py-1 text-[11px] focus:outline-none"
                  disabled={mode === 'edit'}
                />
              </div>
              <div className="w-2/3">
                <label className="block text-gray-700 font-bold mb-1 text-[11px]">Nome</label>
                <input 
                  type="text" 
                  value={formData.name || ''}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full border border-[#a0a0a0] px-2 py-1 text-[11px] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex space-x-4">
              <div className="w-1/3">
                <label className="block text-gray-700 font-bold mb-1 text-[11px]">Categoria</label>
                <select 
                  value={formData.category || ''}
                  onChange={e => setFormData({...formData, category: e.target.value})}
                  className="w-full border border-[#a0a0a0] px-2 py-1 text-[11px] bg-white focus:outline-none"
                >
                  <option value="Operação">Operação</option>
                  <option value="Gestão">Gestão</option>
                  <option value="Backoffice">Backoffice</option>
                  <option value="Auditoria">Auditoria</option>
                </select>
              </div>
              <div className="w-1/3">
                <label className="block text-gray-700 font-bold mb-1 text-[11px]">Estado</label>
                <select 
                  value={formData.status || ''}
                  onChange={e => setFormData({...formData, status: e.target.value as any})}
                  className="w-full border border-[#a0a0a0] px-2 py-1 text-[11px] bg-white focus:outline-none"
                >
                  <option value="Active">Ativo</option>
                  <option value="Draft">Rascunho</option>
                  <option value="Inactive">Inativo</option>
                </select>
              </div>
              <div className="w-1/3 flex items-end pb-1">
                <label className="flex items-center space-x-2 text-[11px] font-bold">
                  <input 
                    type="checkbox" 
                    checked={formData.is_global || false}
                    onChange={e => setFormData({...formData, is_global: e.target.checked})}
                  />
                  <span>Perfil Global (Todas as Empresas)</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-gray-700 font-bold mb-1 text-[11px]">Descrição</label>
              <textarea 
                value={formData.description || ''}
                onChange={e => setFormData({...formData, description: e.target.value})}
                className="w-full border border-[#a0a0a0] px-2 py-1 text-[11px] h-16 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </ClassicWindow>
    );
  }

  return (
    <ClassicWindow 
      title="Gestão de Perfis de Segurança (EAE)" 
      icon={<Shield size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex space-x-2">
            <ClassicButton icon={Plus} label="Novo" onClick={handleCreate} />
            <ClassicButton icon={Edit} label="Editar" onClick={handleEdit} disabled={!selectedProfile} />
            <ClassicButton icon={Trash2} label="Eliminar" onClick={handleDelete} disabled={!selectedProfile} />
          </div>
          <div className="text-gray-600">
            {isLoading ? 'A carregar...' : `${profiles?.length || 0} perfis encontrados`}
          </div>
        </>
      }
    >
      <ClassicGrid 
        columns={columns} 
        data={profiles || []} 
        onRowDoubleClick={(row) => {
          setSelectedProfile(row);
          handleEdit();
        }}
        onRowClick={setSelectedProfile}
      />
    </ClassicWindow>
  );
};

export default RolesView;
