import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import { Soup, ChefHat, ChevronRight } from 'lucide-react';
import { useKDS, useAdvanceKDS } from '../../hooks/usePosMgmt';
import { KDS_STATIONS } from '../../api/posmgmt';

const STATUS_STYLE: Record<string, string> = {
  FIRED: 'bg-[#fff3cd] border-[#f0c040]',
  PREPARING: 'bg-[#cfe2ff] border-[#6aa2e8]',
  READY: 'bg-[#d4f5d4] border-[#5cb85c]',
};
const NEXT_LABEL: Record<string, string> = { FIRED: 'Iniciar', PREPARING: 'Pronto', READY: 'Servido' };

interface KDSProps { fixedStation?: string; title?: string }

export default function KDSView({ fixedStation, title }: KDSProps = {}) {
  const [station, setStation] = useState(fixedStation || 'KITCHEN');
  const { data: queue = [] } = useKDS(station);
  const advance = useAdvanceKDS();

  const elapsed = (fired?: string | null) => {
    if (!fired) return '';
    const mins = Math.floor((Date.now() - new Date(fired).getTime()) / 60000);
    return `${mins}m`;
  };

  return (
    <ClassicWindow title={title || 'Kitchen Display System (KDS)'} icon={<ChefHat size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">{queue.length} itens em produção · atualiza automaticamente · apenas produção (sem preços/pagamentos)</div>}>
      <div className="flex flex-col h-full bg-[#2a2a2a]">
        {/* Estações — ocultas quando o display é fixo a uma estação */}
        {!fixedStation && (
          <div className="flex bg-[#1a1a1a] px-2 pt-1 gap-1">
            {KDS_STATIONS.map((s) => (
              <button key={s.value} onClick={() => setStation(s.value)}
                className={`px-4 py-1.5 text-[12px] font-bold border border-b-0 ${station === s.value ? 'bg-[#2a2a2a] text-white border-[#555]' : 'bg-[#111] text-gray-400 border-[#333]'}`}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Fila de comandas */}
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 content-start">
          {queue.map((l) => (
            <div key={l.id} className={`border-2 ${STATUS_STYLE[l.kds_status] || 'bg-white border-gray-400'} p-2 flex flex-col`}>
              <div className="flex justify-between items-center border-b border-black/20 pb-1 mb-1">
                <span className="font-bold text-[12px]">{l.table_label ? `Mesa ${l.table_label}` : l.ticket_number.slice(0, 8)}</span>
                <span className="text-[10px] text-gray-700 flex items-center"><Soup size={11} className="mr-1" />{elapsed(l.fired_at)}</span>
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-bold text-gray-900">{Number(l.quantity).toFixed(0)}× {l.item_name}</div>
                {l.note && <div className="text-[11px] text-red-700 italic">» {l.note}</div>}
                <div className="text-[10px] text-gray-600 mt-1">{l.kds_status_display}</div>
              </div>
              <button onClick={() => advance.mutate(l.id)}
                className="mt-2 w-full py-1.5 bg-[#1e3f66] hover:bg-[#16304a] text-white text-[11px] font-bold flex items-center justify-center">
                {NEXT_LABEL[l.kds_status] || 'Avançar'} <ChevronRight size={12} />
              </button>
            </div>
          ))}
          {queue.length === 0 && (
            <div className="col-span-full text-center text-gray-400 py-10 text-[13px]">Sem itens em produção nesta estação.</div>
          )}
        </div>
      </div>
    </ClassicWindow>
  );
}
