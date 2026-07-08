import React from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicGrid from '../ui/ClassicGrid';
import { Settings } from 'lucide-react';

const PlansView: React.FC = () => {
  const columns = [
    { header: 'ID', accessor: 'id', width: '10%' },
    { header: 'Nome do Plano', accessor: 'name', width: '30%' },
    { header: 'Mensalidade Base', accessor: 'price', width: '20%' },
    { header: 'Módulos Incluídos', accessor: 'modules', width: '40%' }
  ];

  const data = [
    { id: '1', name: 'Plano Essential', price: '29.90 €', modules: 'POS Core' },
    { id: '2', name: 'Plano Pro', price: '59.90 €', modules: 'POS Core, WMS Core' },
  ];

  return (
    <ClassicWindow title="Planos Comerciais" icon={<Settings size={14} className="text-gray-300" />}>
      <ClassicGrid columns={columns} data={data} />
    </ClassicWindow>
  );
};

export default PlansView;
