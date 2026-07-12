import ClassicWindow from '../../ui/ClassicWindow';
import ClassicGrid from '../../ui/ClassicGrid';
import { Calculator } from 'lucide-react';
import { useWhCosting } from '../../../hooks/useWh';

const AOA = (n: any) => new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 }).format(Number(n) || 0) + ' Kz';

export default function WhCostingView() {
  const { data: d, isLoading } = useWhCosting();
  return (
    <ClassicWindow title="Valorização de Stock (FIFO / FEFO)" icon={<Calculator size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Valor total imobilizado: <span className="font-bold text-[#1e3f66]">{AOA(d?.total_value)}</span></div>}>
      <div className="p-3 space-y-3">
        {isLoading || !d ? <div className="text-center text-gray-400 py-8 text-[12px]">A carregar…</div> : (
          <>
            <div className="bg-[#eef4fb] border border-[#a0a0a0] px-3 py-2 text-[11px] text-gray-700">
              <b>Método de custeio:</b> {d.method}
            </div>
            <div className="bg-white border border-[#a0a0a0]">
              <div className="bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-1.5 text-[11px] font-bold text-gray-700">Valorização por armazém</div>
              <ClassicGrid rowKey="warehouse" data={d.by_warehouse} columns={[
                { header: 'Armazém', accessor: 'warehouse', width: '40%' },
                { header: 'SKUs', accessor: 'skus', width: '15%' },
                { header: 'Qtd total', accessor: (r: any) => new Intl.NumberFormat('pt-AO').format(r.total_qty), width: '20%' },
                { header: 'Valor', accessor: (r: any) => AOA(r.stock_value), width: '25%' },
              ]} />
            </div>
            <div className="bg-white border border-[#a0a0a0]">
              <div className="bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-1.5 text-[11px] font-bold text-gray-700">Top artigos por valor imobilizado</div>
              <ClassicGrid rowKey="item" data={d.top_items} columns={[
                { header: 'Artigo', accessor: 'item', width: '38%' },
                { header: 'Armazém', accessor: 'warehouse', width: '25%' },
                { header: 'Qtd', accessor: (r: any) => new Intl.NumberFormat('pt-AO').format(r.qty), width: '17%' },
                { header: 'Valor', accessor: (r: any) => AOA(r.value), width: '20%' },
              ]} />
            </div>
          </>
        )}
      </div>
    </ClassicWindow>
  );
}
