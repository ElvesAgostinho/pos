import React from 'react';
import ClassicWindow from '../../ui/ClassicWindow';
import ClassicGrid from '../../ui/ClassicGrid';
import { Settings } from 'lucide-react';
import { mockAuthState } from '../../../engine/authorization/mockData';

const ContextRulesView: React.FC = () => {
  const columns = [
    { header: 'ID Regra', accessor: 'id', width: '20%' },
    { header: 'Perfil Afetado', accessor: 'role_id', width: '20%' },
    { header: 'Recurso Alvo', accessor: 'resource', width: '20%' },
    { header: 'Ação', accessor: 'actions', width: '10%' },
    { header: 'Condição (ABAC)', accessor: 'condition_desc', width: '30%' },
  ];

  const abacPolicies = mockAuthState.policies
    .filter(p => p.conditions && p.conditions.length > 0)
    .map(p => ({
      id: p.id,
      role_id: p.role_id,
      resource: p.resource,
      actions: p.actions.join(', '),
      condition_desc: p.conditions!.map(c => `Se [${c.field}] ${c.operator} ${c.value}`).join(' AND ')
    }));

  return (
    <ClassicWindow title="Regras de Contexto Avançado (ABAC)" icon={<Settings size={14} className="text-gray-300" />}>
      <ClassicGrid columns={columns} data={abacPolicies} />
    </ClassicWindow>
  );
};

export default ContextRulesView;
