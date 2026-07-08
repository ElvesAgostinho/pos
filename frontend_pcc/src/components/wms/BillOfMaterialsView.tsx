import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChefHat, Plus, Save, Trash2, GitMerge } from 'lucide-react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { useBoms, useCreateBom, useUpdateBom, useDeleteBom } from '../../hooks/useWms';
import { apiClient } from '../../api/client';
import type { WMSBillOfMaterials, WMSBillOfMaterialsLine } from '../../api/wms';
import { useOutlets } from '../../hooks/usePos';

const fetchItems = async () => (await apiClient.get('mdm/items/')).data;
const fetchUoms = async () => (await apiClient.get('mdm/uoms/')).data;

export default function BillOfMaterialsView() {
  const { data: boms, refetch } = useBoms();
  const { data: outlets } = useOutlets();
  const { data: items } = useQuery({ queryKey: ['mdm_items'], queryFn: fetchItems });
  const { data: uoms } = useQuery({ queryKey: ['mdm_uoms'], queryFn: fetchUoms });

  const createBom = useCreateBom();
  const updateBom = useUpdateBom();
  const deleteBom = useDeleteBom();

  const [selectedBom, setSelectedBom] = useState<WMSBillOfMaterials | null>(null);
  const [formData, setFormData] = useState<Partial<WMSBillOfMaterials>>({});
  const [linesData, setLinesData] = useState<Partial<WMSBillOfMaterialsLine>[]>([]);
  const [mode, setMode] = useState<'list' | 'edit'>('list');

  const handleSelectBom = (bom: WMSBillOfMaterials) => {
    setSelectedBom(bom);
    setFormData({
      item: bom.item,
      outlet: bom.outlet,
      version: bom.version,
      yield_percentage: bom.yield_percentage,
      preparation_time_mins: bom.preparation_time_mins,
      instructions: bom.instructions,
      is_active: bom.is_active
    });
    setLinesData(bom.lines || []);
    setMode('edit');
  };

  const handleNewBom = () => {
    setSelectedBom(null);
    setFormData({
      yield_percentage: 100,
      version: 1,
      is_active: true
    });
    setLinesData([]);
    setMode('edit');
  };

  const handleSave = async () => {
    if (!formData.item) {
      alert('Por favor selecione o Artigo de Venda (Produto Final).');
      return;
    }
    
    const payload = {
      ...formData,
      lines: linesData as WMSBillOfMaterialsLine[]
    };

    try {
      if (selectedBom && selectedBom.id) {
        await updateBom.mutateAsync({ id: selectedBom.id, data: payload });
        alert('Ficha Técnica atualizada com sucesso!');
      } else {
        await createBom.mutateAsync(payload);
        alert('Ficha Técnica criada com sucesso!');
      }
      setMode('list');
      refetch();
    } catch (e) {
      alert('Erro ao gravar. Verifique se a versão já existe para este artigo.');
    }
  };

  const handleAddLine = () => {
    setLinesData([
      ...linesData,
      {
        quantity: 1,
        conversion_factor: 1,
        wastage_percentage: 0
      }
    ]);
  };

  const updateLine = (index: number, field: keyof WMSBillOfMaterialsLine, value: any) => {
    const newLines = [...linesData];
    newLines[index] = { ...newLines[index], [field]: value };
    setLinesData(newLines);
  };

  const removeLine = (index: number) => {
    const newLines = [...linesData];
    newLines.splice(index, 1);
    setLinesData(newLines);
  };

  const getItemName = (id: number) => items?.find((i: any) => i.id === id)?.name || id;

  if (mode === 'edit') {
    return (
      <ClassicWindow 
        title={selectedBom ? "Editar Ficha Técnica" : "Nova Ficha Técnica"}
        icon={<ChefHat size={14} className="text-gray-300" />}
        footer={
          <>
            <div className="flex items-center space-x-2">
              <ClassicButton icon={Save} label="Gravar" onClick={handleSave} />
            </div>
            <div className="flex items-center">
               <ClassicButton label="Cancelar" onClick={() => setMode('list')} />
            </div>
          </>
        }
      >
        <div className="p-4 flex flex-col h-full bg-[#f0f0f0] overflow-y-auto">
          {/* Header Form */}
          <div className="bg-white border border-[#a0a0a0] p-3 mb-3">
            <h3 className="font-bold text-[#1e3f66] text-xs mb-2 border-b border-[#a0a0a0] pb-1">Detalhes do Artigo Final</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 font-bold mb-1">Artigo a Produzir (Venda)</label>
                <select 
                  value={formData.item || ''} 
                  onChange={e => setFormData({...formData, item: Number(e.target.value)})}
                  className="w-full border border-[#a0a0a0] p-1 text-[11px] focus:outline-none"
                >
                  <option value="" disabled>Selecionar Artigo</option>
                  {items?.filter((i: any) => i.item_type === 'FB' || i.item_type === 'PHYSICAL').map((i: any) => (
                    <option key={i.id} value={i.id}>[{i.code}] {i.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-700 font-bold mb-1">Outlet (Opcional - Override)</label>
                <select 
                  value={formData.outlet || ''} 
                  onChange={e => setFormData({...formData, outlet: e.target.value ? Number(e.target.value) : null})}
                  className="w-full border border-[#a0a0a0] p-1 text-[11px] focus:outline-none"
                >
                  <option value="">Global (Aplica-se a todos)</option>
                  {outlets?.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-700 font-bold mb-1">Versão da Receita</label>
                <input type="number" value={formData.version || 1} onChange={e => setFormData({...formData, version: Number(e.target.value)})} className="w-full border border-[#a0a0a0] px-2 py-1 focus:outline-none" />
              </div>
              <div>
                <label className="block text-gray-700 font-bold mb-1">Rendimento Global (% Yield)</label>
                <input type="number" value={formData.yield_percentage || 100} onChange={e => setFormData({...formData, yield_percentage: Number(e.target.value)})} className="w-full border border-[#a0a0a0] px-2 py-1 focus:outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-gray-700 font-bold mb-1">Instruções de Preparação</label>
                <textarea rows={3} value={formData.instructions || ''} onChange={e => setFormData({...formData, instructions: e.target.value})} className="w-full border border-[#a0a0a0] px-2 py-1 focus:outline-none" placeholder="Passo a passo..."></textarea>
              </div>
            </div>
          </div>

          {/* Lines / Ingredients */}
          <div className="flex-1 flex flex-col bg-white border border-[#a0a0a0]">
            <div className="bg-[#e8e8e8] border-b border-[#a0a0a0] p-1 flex items-center justify-between">
               <span className="font-bold text-[#1e3f66] ml-2">Matérias-Primas</span>
               <ClassicButton icon={Plus} label="Adicionar Ingrediente" onClick={handleAddLine} />
            </div>
            <div className="flex-1 overflow-auto min-h-[150px]">
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-[#f0f0f0] border-b border-[#a0a0a0]">
                  <tr>
                    <th className="text-left py-1 px-2 border-r border-[#d0d0d0] font-normal text-gray-800 w-1/3">Matéria-Prima</th>
                    <th className="text-left py-1 px-2 border-r border-[#d0d0d0] font-normal text-gray-800">Qtd. na Receita</th>
                    <th className="text-left py-1 px-2 border-r border-[#d0d0d0] font-normal text-gray-800">Unidade (UoM)</th>
                    <th className="text-left py-1 px-2 border-r border-[#d0d0d0] font-normal text-gray-800">Mult. Base</th>
                    <th className="text-left py-1 px-2 border-r border-[#d0d0d0] font-normal text-gray-800">Quebra (%)</th>
                    <th className="p-1 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {linesData.map((line, idx) => (
                    <tr key={idx} className="border-b border-[#e0e0e0]">
                      <td className="p-1 border-r border-[#e0e0e0]">
                        <select 
                          value={line.raw_material || ''} 
                          onChange={e => updateLine(idx, 'raw_material', Number(e.target.value))}
                          className="w-full border border-[#a0a0a0] focus:outline-none"
                        >
                          <option value="" disabled>Selecionar...</option>
                          {items?.map((i: any) => (
                            <option key={i.id} value={i.id}>{i.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-1 border-r border-[#e0e0e0]">
                        <input type="number" step="0.001" value={line.quantity || 0} onChange={e => updateLine(idx, 'quantity', Number(e.target.value))} className="w-full border border-[#a0a0a0] px-1 focus:outline-none" />
                      </td>
                      <td className="p-1 border-r border-[#e0e0e0]">
                        <select 
                          value={line.uom || ''} 
                          onChange={e => updateLine(idx, 'uom', Number(e.target.value))}
                          className="w-full border border-[#a0a0a0] focus:outline-none"
                        >
                          <option value="" disabled>UoM...</option>
                          {uoms?.map((u: any) => (
                            <option key={u.id} value={u.id}>{u.code}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-1 border-r border-[#e0e0e0]">
                        <input type="number" step="0.001" value={line.conversion_factor || 1} onChange={e => updateLine(idx, 'conversion_factor', Number(e.target.value))} className="w-full border border-[#a0a0a0] px-1 focus:outline-none" />
                      </td>
                      <td className="p-1 border-r border-[#e0e0e0]">
                        <input type="number" value={line.wastage_percentage || 0} onChange={e => updateLine(idx, 'wastage_percentage', Number(e.target.value))} className="w-full border border-[#a0a0a0] px-1 focus:outline-none" />
                      </td>
                      <td className="p-1 text-center">
                        <button onClick={() => removeLine(idx)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-[#fff] border-t border-[#a0a0a0] p-2 text-gray-500">
               Nota: O multiplicador base garante a conversão para a unidade de inventário (Ex: 1 Shot = 0.05 Garrafa).
            </div>
          </div>
        </div>
      </ClassicWindow>
    );
  }

  const columns = [
    { header: 'Artigo (Receita)', accessor: (r: any) => getItemName(r.item), width: '40%' },
    { header: 'Versão', accessor: 'version', width: '10%' },
    { header: 'Outlet', accessor: (r: any) => r.outlet ? outlets?.find(o => o.id === r.outlet)?.name : 'Global', width: '20%' },
    { header: 'Rendimento', accessor: (r: any) => `${r.yield_percentage}%`, width: '15%' },
    { header: 'Ativa', accessor: (r: any) => r.is_active ? 'Sim' : 'Não', width: '15%' },
  ];

  return (
    <ClassicWindow 
      title="Fichas Técnicas (BOM)"
      icon={<ChefHat size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={Plus} label="Nova Ficha Técnica" onClick={handleNewBom} />
          </div>
          <div className="text-gray-600">
            Nº registos a visualizar: {boms?.length || 0}
          </div>
        </>
      }
    >
      <ClassicGrid 
        columns={columns} 
        data={boms || []} 
        onRowClick={(row) => handleSelectBom(row)}
      />
    </ClassicWindow>
  );
}
