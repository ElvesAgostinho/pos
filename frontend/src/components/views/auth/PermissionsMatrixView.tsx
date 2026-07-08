import React, { useMemo } from 'react';
import ClassicWindow from '../../ui/ClassicWindow';
import { Shield } from 'lucide-react';
import { useProfiles, useResources, usePolicies } from '../../../hooks/useEae';

const PermissionsMatrixView: React.FC = () => {
  const { data: profiles, isLoading: isLoadingProfiles } = useProfiles();
  const { data: resources, isLoading: isLoadingResources } = useResources();
  const { data: policies, isLoading: isLoadingPolicies } = usePolicies();

  const isLoading = isLoadingProfiles || isLoadingResources || isLoadingPolicies;

  const policyMatrix = useMemo(() => {
    if (!policies) return {};
    const matrix: Record<string, Record<number, string>> = {};
    policies.forEach(p => {
      if (!matrix[p.resource]) matrix[p.resource] = {};
      matrix[p.resource][p.profile] = p.effect === 'allow' ? `✓ ${p.action}` : `✖ Denied`;
    });
    return matrix;
  }, [policies]);

  if (isLoading) {
    return <ClassicWindow title="Matriz de Permissões" icon={<Shield size={14} className="text-gray-300" />}><div className="p-4">A carregar matriz...</div></ClassicWindow>;
  }

  return (
    <ClassicWindow title="Matriz de Permissões (ABAC & RBAC)" icon={<Shield size={14} className="text-gray-300" />}>
      <div className="flex flex-col h-full bg-white">
        {/* Toolbar */}
        <div className="bg-[#f0f0f0] border-b border-[#a0a0a0] p-1 flex items-center space-x-2 shrink-0">
           <button className="px-3 py-1 bg-white border border-[#a0a0a0] hover:bg-[#e0e0e0] text-black">Gravar Matriz</button>
           <button className="px-3 py-1 bg-white border border-[#a0a0a0] hover:bg-[#e0e0e0] text-black">Recarregar</button>
           <span className="text-gray-500 ml-4">Selecione as permissões de cruzamento (Módulo vs Perfil)</span>
        </div>

        {/* Matrix Area */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          {(!resources || resources.length === 0) ? (
            <div className="p-4 text-gray-500 text-center">Nenhum recurso catalogado. Para inicializar, corra o script de Backfill ou crie recursos na API.</div>
          ) : (
            <table className="w-full text-left border-collapse whitespace-nowrap table-fixed">
              <thead className="sticky top-0 z-10 bg-[#e0e0e0] border-b border-[#a0a0a0] shadow-sm">
                <tr>
                  <th className="font-normal px-2 py-1 border-r border-[#c0c0c0] w-[250px] bg-[#d0d0d0]">Recurso / Módulo</th>
                  {profiles?.map(profile => (
                    <th key={profile.id} className="font-normal px-2 py-1 border-r border-[#c0c0c0] w-[120px] text-center">
                      {profile.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resources?.map(resource => (
                  <tr key={resource.id} className="border-b border-[#e0e0e0] hover:bg-[#cce8ff]">
                    <td className="px-2 py-1 border-r border-[#e0e0e0] bg-[#f9f9f9]" title={resource.urn}>
                      <span className="font-bold ml-0">{resource.name}</span>
                    </td>
                    {profiles?.map(profile => {
                      const policy = policyMatrix[resource.id]?.[profile.id];
                      return (
                        <td key={profile.id} className={`px-2 py-1 border-r border-[#e0e0e0] text-center ${policy?.includes('✓') ? 'text-green-600' : policy?.includes('✖') ? 'text-red-500' : 'text-gray-400'}`}>
                          {policy || '-'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ClassicWindow>
  );
};

export default PermissionsMatrixView;
