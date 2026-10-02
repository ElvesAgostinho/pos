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
      <div className="w-[460px] bg-[#F4F6F7] border border-[#C8D2D5] shadow-2xl rounded-[16px] overflow-hidden" onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
        {/* Barra de título */}
        <div className="h-8 flex items-center gap-2 px-3 text-white font-bold text-[12px]"
          style={{ background: 'linear-gradient(to bottom, #4B858E, #4B858E 55%, #062F35)' }}>
          <TriangleAlert size={14} />{g.title}
        </div>

        <div className="p-4 flex gap-3">
          <div className="w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center text-[22px] text-white"
            style={{ background: 'linear-gradient(to bottom, #4B858E, #4B858E)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 4px rgba(0,0,0,0.25)' }}>!</div>
          <div className="flex-1 text-[12px] text-[#1F292C]">
            <div className="whitespace-pre-line font-semibold leading-relaxed">{g.message}</div>
            {g.hint && (
              <div className="mt-3 p-2 bg-[#F4F6F7] border border-[#E4E9EB] text-[11px] text-[#657377] flex gap-2">
                <Lightbulb size={14} className="flex-shrink-0 mt-px" /><span><b>O que fazer:</b> {g.hint}</span>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-2.5 bg-gradient-to-b from-[#F4F6F7] to-[#F4F6F7] border-t border-[#C8D2D5] flex justify-end">
          <button onClick={() => setG(null)} autoFocus
            className="px-6 py-1.5 text-[12px] font-semibold text-[#1F292C] border"
            style={{
              background: 'linear-gradient(to bottom, #FFFFFF, #F4F6F7 48%, #E4E9EB 52%, #E4E9EB)',
              borderColor: '#4B858E',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.18)',
            }}>
            Percebi
          </button>
        </div>
      </div>
    </div>
  );
}
