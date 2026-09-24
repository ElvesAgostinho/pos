import { useState } from 'react';
import { X } from 'lucide-react';

/** "Nova pesquisa" — popup pequeno, no mesmo estilo escuro do resto do PMS
 * (nunca o teclado/prompt genérico do POS Front Office). Partilhado por todos
 * os ecrãs de pesquisa do PMS (Reservas, Reservas de Grupo, …). */
export default function PmsSaveSearchDialog({ initial, onCancel, onConfirm }: {
  initial: string; onCancel: () => void; onConfirm: (nome: string) => void;
}) {
  const [nome, setNome] = useState(initial);
  return (
    <div className="fixed inset-0 z-[9100] flex items-center justify-center bg-black/40">
      <div className="w-[380px] bg-[#F7FAFA] border border-[#5C8891] shadow-xl">
        <div className="h-9 flex items-center justify-between px-3 text-white text-[13px] font-bold" style={{ background: '#041F24' }}>
          Nova pesquisa
          <button onClick={onCancel} title="Fechar"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-[#B0392B] text-white hover:brightness-110">
            <X size={12} strokeWidth={3} />
          </button>
        </div>
        <div className="p-3 text-[12px]">
          <label className="flex flex-col gap-1">
            Introduza o nome desta pesquisa
            <input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus
              onKeyDown={(e) => e.key === 'Enter' && nome.trim() && onConfirm(nome.trim())}
              className="border border-[#7FA9B1] p-1.5 bg-white" />
          </label>
        </div>
        <div className="flex justify-end gap-2 px-3 py-2 bg-[#F7FAFA] border-t border-[#CFE3E6]">
          <button onClick={onCancel} className="px-3 py-1 text-[12px] border border-[#7FA9B1] bg-white hover:bg-[#F7FAFA]">Cancelar</button>
          <button onClick={() => nome.trim() && onConfirm(nome.trim())} disabled={!nome.trim()}
            className="px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: '#062A31' }}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
