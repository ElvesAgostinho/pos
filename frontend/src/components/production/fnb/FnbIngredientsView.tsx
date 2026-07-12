import { useState } from 'react';
import ClassicWindow from '../../ui/ClassicWindow';
import ClassicGrid from '../../ui/ClassicGrid';
import { Carrot, Search } from 'lucide-react';
import { useFnbItems } from '../../../hooks/useFnb';

const AOA = (n: any) => new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' Kz';

/** Ingredientes = artigos do Master Data usados na produção (custo médio real por unidade). */
export default function FnbIngredientsView() {
  const [q, setQ] = useState('');
  const { data: items = [], isLoading } = useFnbItems(q || undefined);

  return (
    <ClassicWindow
      title="Gestão de Ingredientes"
      icon={<Carrot size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{items.length} artigo(s) · custo médio ponderado do stock</div>}
    >
      <div className="p-2 space-y-2 h-full flex flex-col">
        <div className="flex items-center gap-2 bg-[#f0f0f0] border border-[#a0a0a0] p-2 text-[11px]">
          <Search size={14} className="text-gray-500" />
          <input placeholder="Pesquisar ingrediente (nome/código)…" value={q} onChange={(e) => setQ(e.target.value)} className="border border-[#a0a0a0] p-1 flex-1" />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid
            rowKey="id" data={items}
            columns={[
              { header: 'Código', accessor: 'code', width: '14%' },
              { header: 'Ingrediente', accessor: 'name', width: '42%' },
              { header: 'Tipo', accessor: (r: any) => r.item_type || '—', width: '18%' },
              { header: 'Un.', accessor: (r: any) => r.base_uom_code || '—', width: '10%' },
              { header: 'Custo médio', accessor: (r: any) => AOA(r.current_average_cost), width: '16%' },
            ]}
          />
          {!isLoading && items.length === 0 && (
            <div className="text-center text-gray-400 text-[12px] py-8">Sem ingredientes. Adicione artigos no Master Data.</div>
          )}
        </div>
      </div>
    </ClassicWindow>
  );
}
