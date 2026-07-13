import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar } from './kit';

/**
 * OPÇÕES DO PLANNING — a ORDEM e as CORES com que os espaços aparecem no mapa.
 *
 * O planning é o ecrã onde o comercial vive. Se as salas aparecerem por ordem
 * alfabética em vez da ordem física do hotel (piso 0, piso 1, jardim), ele perde
 * tempo a procurar — e é a procurar à pressa que se vende duas vezes a mesma sala.
 *
 * Arrasta-se para ordenar. A ordem que fica aqui é a ordem que ele vê.
 */
export default function PlanningOptions() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<any[]>([]);
  const [drag, setDrag] = useState<number | null>(null);

  const { data } = useQuery({
    queryKey: ['posc', 'planning'],
    queryFn: async () => (await apiClient.get('pos/config/planning-options/')).data,
  });
  useEffect(() => { if (data) setRows(data); }, [data]);

  const save = useMutation({
    mutationFn: () => apiClient.post('pos/config/planning-options/', { rows }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc', 'planning'] });
      notifyGuide({
        title: 'Planning gravado',
        message: 'É esta a ordem e as cores que o comercial vê no mapa de espaços.',
      });
    },
    onError: notifyError,
  });

  const set = (i: number, k: string, v: any) =>
    setRows((o) => o.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const largar = (i: number) => {
    if (drag === null || drag === i) return;
    const novo = [...rows];
    const [movido] = novo.splice(drag, 1);
    novo.splice(i, 0, movido);
    setRows(novo);
    setDrag(null);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="px-3 py-1.5 bg-[#e9e9e9] text-[13px] font-bold text-[#333] border-b border-[#d0d0d0]">
        Arraste para ordenar
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0"><tr className="bg-[#f4f4f4]">
            <th className="w-[40px] border-b border-[#d0d0d0]" />
            <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Espaço</th>
            <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0] w-[180px]">Cor de Fundo</th>
            <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0] w-[180px]">Cor do texto</th>
            <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0] w-[200px]">Como fica</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.space} draggable
                onDragStart={() => setDrag(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => largar(i)}
                className={`border-b border-[#eee] cursor-move ${drag === i ? 'opacity-40' : 'hover:bg-[#f5f9ff]'}`}>
                <td className="text-center text-[#999] select-none">⠿</td>
                <td className="px-2 py-1.5 font-semibold">{r.name}</td>
                <td className="p-1">
                  <div className="flex items-center gap-2">
                    <input type="color" value={r.bg_color} onChange={(e) => set(i, 'bg_color', e.target.value)}
                      className="w-9 h-7 border border-[#8a95a3]" />
                    <span className="font-mono text-[11px] text-[#666]">{r.bg_color}</span>
                  </div>
                </td>
                <td className="p-1">
                  <div className="flex items-center gap-2">
                    <input type="color" value={r.text_color} onChange={(e) => set(i, 'text_color', e.target.value)}
                      className="w-9 h-7 border border-[#8a95a3]" />
                    <span className="font-mono text-[11px] text-[#666]">{r.text_color}</span>
                  </div>
                </td>
                <td className="p-1">
                  <div className="px-3 py-1.5 text-[12px] font-bold text-center"
                    style={{ background: r.bg_color, color: r.text_color }}>
                    {r.name}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="text-center text-[#999] py-10">
                Sem espaços. Crie-os em Parâmetros do Sistema → Setores.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
      ]} />
    </div>
  );
}
