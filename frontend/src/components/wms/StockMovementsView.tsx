import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicGrid from '../ui/ClassicGrid';
import ClassicButton from '../ui/ClassicButton';
import { Plus, Save, Trash2, CheckCircle } from 'lucide-react';
import { useTransactions, useCreateTransaction, useLocations } from '../../hooks/useWms';
import { apiClient } from '../../api/client';
import type { WMSStockTransaction, WMSStockTransactionLine } from '../../api/wms';

const fetchItems = async () => (await apiClient.get('mdm/items/')).data;
const fetchUoms = async () => (await apiClient.get('mdm/uoms/')).data;

export default function StockMovementsView() {
  const { data: transactions } = useTransactions();
  const { data: locations } = useLocations();
  const { data: items } = useQuery({ queryKey: ['mdm_items'], queryFn: fetchItems });
  const { data: uoms } = useQuery({ queryKey: ['mdm_uoms'], queryFn: fetchUoms });
  
  const createTransaction = useCreateTransaction();

  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [formData, setFormData] = useState<Partial<WMSStockTransaction>>({
    transaction_type: 'RECEIPT'
  });
  const [lines, setLines] = useState<Partial<WMSStockTransactionLine>[]>([]);

  const handleSave = async () => {
    if (lines.length === 0) {
      alert('Adicione pelo menos um artigo.');
      return;
    }
    
    try {
      await createTransaction.mutateAsync({
        ...formData,
        lines: lines as WMSStockTransactionLine[]
      });
      alert('Movimento registado com sucesso!');
      setMode('list');
      setFormData({ transaction_type: 'RECEIPT' });
      setLines([]);
    } catch (e) {
      alert('Erro ao registar movimento.');
    }
  };

  const columns = [
    { header: 'ID / Ref', accessor: (r: any) => r.reference_document || r.id.substring(0,8), width: '20%' },
    { header: 'Tipo', accessor: 'transaction_type', width: '15%' },
    { header: 'Data', accessor: (r: any) => new Date(r.transaction_date).toLocaleString(), width: '20%' },
    { header: 'Criado Por', accessor: 'created_by', width: '15%' },
    { header: 'Observações', accessor: 'notes', width: '30%' },
  ];

  if (mode === 'create') {
    return (
      <ClassicWindow 
        title="Novo Movimento de Stock"
        footer={
          <>
            <div className="flex items-center space-x-2">
              <ClassicButton icon={Save} label="Gravar" onClick={handleSave} />
            </div>
            <div className="flex items-center">
               <ClassicButton icon={CheckCircle} label="Cancelar" onClick={() => setMode('list')} />
            </div>
          </>
        }
      >
        <div className="p-4 flex flex-col h-full bg-[#f0f0f0]">
          {/* Header */}
          <div className="bg-white border border-[#a0a0a0] p-3 mb-3 flex space-x-4">
            <div>
              <label className="block text-gray-700 font-bold mb-1">Tipo de Movimento</label>
              <select 
                value={formData.transaction_type}
                onChange={e => setFormData({...formData, transaction_type: e.target.value as any})}
                className="border border-[#a0a0a0] px-2 py-1 w-48 bg-white focus:outline-none"
              >
                <option value="RECEIPT">Entrada (Receipt)</option>
                <option value="ISSUE">Saída (Issue)</option>
                <option value="TRANSFER">Transferência</option>
                <option value="ADJUSTMENT">Ajuste de Inventário</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-700 font-bold mb-1">Nº Documento / Ref.</label>
              <input 
                type="text" 
                value={formData.reference_document || ''}
                onChange={e => setFormData({...formData, reference_document: e.target.value})}
                className="border border-[#a0a0a0] px-2 py-1 w-48 focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-gray-700 font-bold mb-1">Observações</label>
              <input 
                type="text" 
                value={formData.notes || ''}
                onChange={e => setFormData({...formData, notes: e.target.value})}
                className="border border-[#a0a0a0] px-2 py-1 w-full focus:outline-none"
              />
            </div>
          </div>

          {/* Lines */}
          <div className="flex-1 flex flex-col bg-white border border-[#a0a0a0]">
            <div className="bg-[#e8e8e8] border-b border-[#a0a0a0] p-1 flex">
               <ClassicButton icon={Plus} label="Adicionar Linha" onClick={() => setLines([...lines, { quantity: 1, conversion_factor: 1 }])} />
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-[#f0f0f0] border-b border-[#a0a0a0]">
                  <tr>
                    <th className="p-1 border-r border-[#d0d0d0] text-left">Artigo</th>
                    <th className="p-1 border-r border-[#d0d0d0] text-left">Armazém/Local Origem</th>
                    <th className="p-1 border-r border-[#d0d0d0] text-left">Armazém/Local Destino</th>
                    <th className="p-1 border-r border-[#d0d0d0] text-left">Lote</th>
                    <th className="p-1 border-r border-[#d0d0d0] text-left">Qtd.</th>
                    <th className="p-1 border-r border-[#d0d0d0] text-left">UoM</th>
                    <th className="p-1 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="border-b border-[#e0e0e0]">
                      <td className="p-1 border-r border-[#e0e0e0]">
                        <select 
                          value={line.item || ''} 
                          onChange={e => {
                            const newLines = [...lines];
                            newLines[idx].item = Number(e.target.value);
                            setLines(newLines);
                          }}
                          className="w-full border border-[#a0a0a0] focus:outline-none"
                        >
                          <option value="">Selecione...</option>
                          {items?.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </select>
                      </td>
                      <td className="p-1 border-r border-[#e0e0e0]">
                        <select 
                          value={line.source_location || ''} 
                          disabled={formData.transaction_type === 'RECEIPT'}
                          onChange={e => {
                            const newLines = [...lines];
                            newLines[idx].source_location = e.target.value;
                            setLines(newLines);
                          }}
                          className="w-full border border-[#a0a0a0] bg-white focus:outline-none disabled:bg-gray-200"
                        >
                          <option value="">Nenhum (Entrada)</option>
                          {locations?.map(l => <option key={l.id} value={l.id}>{l.full_code}</option>)}
                        </select>
                      </td>
                      <td className="p-1 border-r border-[#e0e0e0]">
                        <select 
                          value={line.destination_location || ''} 
                          disabled={formData.transaction_type === 'ISSUE'}
                          onChange={e => {
                            const newLines = [...lines];
                            newLines[idx].destination_location = e.target.value;
                            setLines(newLines);
                          }}
                          className="w-full border border-[#a0a0a0] bg-white focus:outline-none disabled:bg-gray-200"
                        >
                          <option value="">Nenhum (Saída)</option>
                          {locations?.map(l => <option key={l.id} value={l.id}>{l.full_code}</option>)}
                        </select>
                      </td>
                      <td className="p-1 border-r border-[#e0e0e0]">
                        <input 
                          type="text" 
                          value={line.batch_number || ''}
                          onChange={e => {
                            const newLines = [...lines];
                            newLines[idx].batch_number = e.target.value;
                            setLines(newLines);
                          }}
                          className="w-full border border-[#a0a0a0] px-1 focus:outline-none"
                        />
                      </td>
                      <td className="p-1 border-r border-[#e0e0e0]">
                        <input 
                          type="number" 
                          value={line.quantity || ''}
                          onChange={e => {
                            const newLines = [...lines];
                            newLines[idx].quantity = Number(e.target.value);
                            setLines(newLines);
                          }}
                          className="w-full border border-[#a0a0a0] px-1 focus:outline-none"
                        />
                      </td>
                      <td className="p-1 border-r border-[#e0e0e0]">
                        <select 
                          value={line.uom || ''} 
                          onChange={e => {
                            const newLines = [...lines];
                            newLines[idx].uom = Number(e.target.value);
                            setLines(newLines);
                          }}
                          className="w-full border border-[#a0a0a0] focus:outline-none"
                        >
                          <option value="">...</option>
                          {uoms?.map((u: any) => <option key={u.id} value={u.id}>{u.code}</option>)}
                        </select>
                      </td>
                      <td className="p-1 text-center">
                        <button onClick={() => {
                          const newLines = [...lines];
                          newLines.splice(idx, 1);
                          setLines(newLines);
                        }} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 && (
                    <tr><td colSpan={7} className="p-4 text-center text-gray-500">Adicione uma linha de artigo.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </ClassicWindow>
    );
  }

  return (
    <ClassicWindow 
      title="Movimentos de Stock (Histórico)"
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={Plus} label="Adicionar" onClick={() => setMode('create')} />
          </div>
          <div className="text-gray-600">
            Nº registos a visualizar: {transactions?.length || 0}
          </div>
        </>
      }
    >
      <ClassicGrid columns={columns} data={transactions || []} />
    </ClassicWindow>
  );
}
