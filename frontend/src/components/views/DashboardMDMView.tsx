import ClassicWindow from '../ui/ClassicWindow';
import { useMdItems, useMdCategories } from '../../hooks/useMasterData';
import { useSuppliers } from '../../hooks/useEsm';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';

const ITEM_TYPE_LABEL: Record<string, string> = {
  RawMaterial: 'Matéria-Prima', Manufactured: 'Produzido', Retail: 'Revenda', Service: 'Serviço',
};

export default function DashboardMDMView() {
  const { data: items = [] } = useMdItems();
  const { data: categories = [] } = useMdCategories();
  const { data: suppliers = [] } = useSuppliers();

  const activeItems = items.filter((i: any) => i.is_active).length;
  const activeSuppliers = suppliers.filter((s: any) => s.status === 'ACTIVE').length;

  // Distribuição de artigos por tipo (dados reais)
  const byType = Object.entries(
    items.reduce((acc: Record<string, number>, i: any) => {
      acc[i.item_type] = (acc[i.item_type] || 0) + 1;
      return acc;
    }, {})
  ).map(([k, v]) => ({ name: ITEM_TYPE_LABEL[k] || k, artigos: v as number }));

  const StatCard = ({ title, value, subtitle }: any) => (
    <div className="bg-[#f0f0f0] border-2 border-white border-b-[#a0a0a0] border-r-[#a0a0a0] p-4 flex flex-col justify-between">
      <div className="mb-2">
        <h3 className="text-xs font-bold text-black mb-1">{title}</h3>
        <div className="text-2xl font-bold text-[#1e3f66]">{value}</div>
      </div>
      <div className="text-[10px] text-gray-600 font-medium">{subtitle}</div>
    </div>
  );

  return (
    <ClassicWindow title="Dashboard — Master Data">
      <div className="bg-[#e6e6e6] min-h-full font-sans p-4 overflow-y-auto">
        <div className="flex justify-between items-center mb-4 border-b border-[#a0a0a0] pb-2">
          <div>
            <h1 className="text-lg font-bold text-black">Resumo Operacional (Master Data)</h1>
            <p className="text-xs text-gray-600 mt-1">Fonte única de cadastros — dados em tempo real.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
          <StatCard title="Total de Artigos" value={items.length} subtitle={`${activeItems} ativos`} />
          <StatCard title="Categorias / Famílias" value={categories.length} subtitle="Estrutura de classificação" />
          <StatCard title="Fornecedores" value={suppliers.length} subtitle={`${activeSuppliers} ativos`} />
          <StatCard title="Tipos de Artigo" value={byType.length} subtitle="Matéria-prima, produzidos…" />
        </div>

        <div className="bg-[#f0f0f0] border-2 border-white border-b-[#a0a0a0] border-r-[#a0a0a0] p-4">
          <h3 className="text-xs font-bold text-black mb-4">Distribuição de Artigos por Tipo</h3>
          <div className="h-56 w-full bg-white border border-[#a0a0a0]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byType} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ccc" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'black' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'black' }} />
                <RechartsTooltip contentStyle={{ borderRadius: 0, border: '1px solid black', backgroundColor: '#ffffaa', fontSize: 10 }} />
                <Bar dataKey="artigos" fill="#1e3f66" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </ClassicWindow>
  );
}
