import React from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicGrid from '../ui/ClassicGrid';
import { Settings } from 'lucide-react';

const LicensesView: React.FC = () => {
  const columns = [
    { header: 'Cliente (Tenant)', accessor: 'client', width: '30%' },
    { header: 'Plano Ativo', accessor: 'plan', width: '20%' },
    { header: 'Assinatura RSA', accessor: 'rsa_status', width: '20%' },
    { header: 'Validade JWT', accessor: 'validity', width: '30%' }
  ];

  const data = [
    { client: 'System Mwana Lodge', plan: 'Plano Pro', rsa_status: 'Assinado ✓', validity: '2027-12-31' },
    { client: 'Restaurante O Marujo', plan: 'Plano Essential', rsa_status: 'Assinado ✓', validity: '2026-05-15' },
  ];

  return (
    <ClassicWindow title="Emissão de Licenças (RSA)" icon={<Settings size={14} className="text-gray-300" />}>
      <ClassicGrid columns={columns} data={data} />
    </ClassicWindow>
  );
};

export default LicensesView;
