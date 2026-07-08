import React from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import { useItems, useCategories, useSuppliers } from '../../hooks/useMdm';
import { useWarehouses, useStockLevels } from '../../hooks/useWms';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  BarChart, Bar
} from 'recharts';

export default function DashboardMDMView() {
  const { data: items = [] } = useItems();
  const { data: categories = [] } = useCategories();
  const { data: suppliers = [] } = useSuppliers();
  const { data: warehouses = [] } = useWarehouses();
  const { data: stockLevels = [] } = useStockLevels();

  const totalStockQuantity = stockLevels.reduce((acc: number, sl: any) => acc + Number(sl.quantity), 0);

  // Mock data for the AreaChart (Stock Evolution)
  const stockHistoryData = [
    { name: 'Jan', stock: 4000 },
    { name: 'Fev', stock: 3000 },
    { name: 'Mar', stock: 2000 },
    { name: 'Abr', stock: 2780 },
    { name: 'Mai', stock: 1890 },
    { name: 'Jun', stock: 2390 },
    { name: 'Jul', stock: totalStockQuantity > 0 ? totalStockQuantity : 3490 },
  ];

  // Mock data for the BarChart (Top Categories)
  const categoryData = categories.slice(0, 5).map((cat: any) => ({
    name: cat.name,
    artigos: items.filter((i: any) => i.category === cat.id).length || Math.floor(Math.random() * 50)
  }));
  
  if (categoryData.length === 0) {
    categoryData.push(
      { name: 'Bebidas', artigos: 45 },
      { name: 'Mercearia', artigos: 30 },
      { name: 'Carnes', artigos: 15 },
      { name: 'Peixaria', artigos: 20 }
    );
  }

  // Classic Card
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
    <ClassicWindow title="Dashboard MDM">
      <div className="bg-[#e6e6e6] min-h-full font-sans p-4 overflow-y-auto">
        
        {/* Header Section */}
        <div className="flex justify-between items-center mb-4 border-b border-[#a0a0a0] pb-2">
          <div>
            <h1 className="text-lg font-bold text-black">Resumo Operacional (Master Data)</h1>
            <p className="text-xs text-gray-600 mt-1">Ponto de situação atual do sistema ERP.</p>
          </div>
          <div className="flex space-x-2">
            <ClassicButton label="Exportar Relatório" />
            <ClassicButton label="Novo Registo" />
          </div>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
          <StatCard 
            title="Total de Artigos" 
            value={items.length} 
            subtitle={`${categories.length} Categorias`}
          />
          <StatCard 
            title="Valor do Inventário" 
            value={`${totalStockQuantity} un`} 
            subtitle={`${warehouses.length} Armazéns`}
          />
          <StatCard 
            title="Fornecedores" 
            value={suppliers.length} 
            subtitle="Registados no sistema"
          />
          <StatCard 
            title="Alertas de Stock" 
            value="12" 
            subtitle="Abaixo do limite mínimo"
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          
          {/* Main Chart - Area */}
          <div className="bg-[#f0f0f0] border-2 border-white border-b-[#a0a0a0] border-r-[#a0a0a0] p-4 lg:col-span-2">
            <h3 className="text-xs font-bold text-black mb-4">Evolução de Inventário Global</h3>
            <div className="h-48 w-full bg-white border border-[#a0a0a0]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stockHistoryData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ccc" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'black' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'black' }} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '0', border: '1px solid black', backgroundColor: '#ffffaa', fontSize: '10px' }}
                  />
                  <Area type="monotone" dataKey="stock" stroke="#1e3f66" strokeWidth={2} fillOpacity={0.3} fill="#1e3f66" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Secondary Chart - Bar */}
          <div className="bg-[#f0f0f0] border-2 border-white border-b-[#a0a0a0] border-r-[#a0a0a0] p-4">
            <h3 className="text-xs font-bold text-black mb-4">Distribuição por Categoria</h3>
            <div className="h-48 w-full bg-white border border-[#a0a0a0]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#ccc" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'black' }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'black' }} width={70} />
                  <RechartsTooltip 
                    cursor={{fill: '#e0e0e0'}} 
                    contentStyle={{ borderRadius: '0', border: '1px solid black', backgroundColor: '#ffffaa', fontSize: '10px' }}
                  />
                  <Bar dataKey="artigos" fill="#000080" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

      </div>
    </ClassicWindow>
  );
}
