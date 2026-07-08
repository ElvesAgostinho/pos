import React from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicGrid from '../ui/ClassicGrid';
import { Settings } from 'lucide-react';

const CatalogView: React.FC = () => {
  const columns = [
    { header: 'Código', accessor: 'code', width: '20%' },
    { header: 'Nome do Módulo', accessor: 'name', width: '40%' },
    { header: 'Versão', accessor: 'version', width: '20%' },
    { header: 'Estado', accessor: 'status', width: '20%' }
  ];

  const data = [
    { code: 'feature_pos_core', name: 'Módulo POS', version: 'v1.0', status: 'Ativo' },
    { code: 'feature_wms_core', name: 'Gestão de Stocks (WMS)', version: 'v1.0', status: 'Ativo' },
  ];

  return (
    <ClassicWindow title="Catálogo de Módulos Globais" icon={<Settings size={14} className="text-gray-300" />}>
      <ClassicGrid columns={columns} data={data} />
    </ClassicWindow>
  );
};

export default CatalogView;
