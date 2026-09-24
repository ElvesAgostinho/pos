import { useEffect, useState } from 'react';
import { TriangleAlert, Lightbulb } from 'lucide-react';
import type { Guide } from '../../utils/friendlyError';

/**
 * Popup explicativo GLOBAL — quando algo corre mal, o sistema explica o que falhou
 * e ORIENTA o que fazer. Montado uma vez; ouve o evento 'erp:guide'.
 */
export default function GuideDialog() {
  const [g, setG] = useState<Guide | null>(null);

  useEffect(() => {
    const h = (e: Event) => setG((e as CustomEvent).detail as Guide);
    window.addEventListener('erp:guide', h);
    return () => window.removeEventListener('erp:guide', h);
  }, []);

  useEffect(() => {
    if (!g) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') setG(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [g]);

  if (!g) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45" onClick={() => setG(null)}>
      <div className="w-[460px] bg-[#F7FAFA] border border-[#7FA9B1] shadow-2xl" onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
        {/* Barra de título */}
        <div className="h-8 flex items-center gap-2 px-3 text-white font-bold text-[12px]"
          style={{ background: 'linear-gradient(to bottom, #5C8891, #5C8891 55%, #062A31)' }}>
          <TriangleAlert size={14} />{g.title}
        </div>

        <div className="p-4 flex gap-3">
          <div className="w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center text-[22px] text-white"
            style={{ background: 'linear-gradient(to bottom, #7FA9B1, #5C8891)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 4px rgba(0,0,0,0.25)' }}>!</div>
          <div className="flex-1 text-[12px] text-[#041F24]">
            <div className="whitespace-pre-line font-semibold leading-relaxed">{g.message}</div>
            {g.hint && (
              <div className="mt-3 p-2 bg-[#F7FAFA] border border-[#EEF4F5] text-[11px] text-[#5C8891] flex gap-2">
                <Lightbulb size={14} className="flex-shrink-0 mt-px" /><span><b>O que fazer:</b> {g.hint}</span>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-2.5 bg-gradient-to-b from-[#F7FAFA] to-[#EEF4F5] border-t border-[#CFE3E6] flex justify-end">
          <button onClick={() => setG(null)} autoFocus
            className="px-6 py-1.5 text-[12px] font-semibold text-[#041F24] border"
            style={{
              background: 'linear-gradient(to bottom, #FFFFFF, #F7FAFA 48%, #EEF4F5 52%, #EEF4F5)',
              borderColor: '#7FA9B1',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.18)',
            }}>
            Percebi
          </button>
        </div>
      </div>
    </div>
  );
}
