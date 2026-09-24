import { useState } from 'react';
import ClassicButton from '../ui/ClassicButton';
import { ArrowLeft, Image, Upload, Trash2, Monitor, Save } from 'lucide-react';
import { aviso } from '../../ui/dialogo';
import { TOKENS, accentGradient } from '../../config/theme';

const STORAGE_KEY = 'ui_wallpaper';
const read = () => (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null) || '';

/** SÓ o papel de parede do Ambiente de Trabalho — nome da empresa, logótipo e
    cor da barra já têm os seus próprios ecrãs (Empresa, Personalização de
    cores) e não se repetem aqui. Guardado por terminal (localStorage), como
    o resto da Aparência: EnterpriseDesktop.tsx lê esta mesma chave.

    Barra de cima igual à do Ambiente de Trabalho / Configuração POS (mesmo
    fundo, mesma altura) — não a moldura genérica do ClassicWindow, para não
    ter um estilo de cabeçalho diferente só neste ecrã. */
export default function DesktopWallpaperView({ onBack, onDesktop }: { onBack?: () => void; onDesktop?: () => void }) {
  const [val, setVal] = useState<string>(read());
  const voltar = onDesktop || onBack;
  const username = JSON.parse(localStorage.getItem('erp_user') || '{}').username || 'operador';

  const onFile = (f?: File) => {
    if (!f) return;
    if (f.size > 3_000_000) { aviso('Imagem demasiado grande (máx. ~3 MB).'); return; }
    const r = new FileReader();
    r.onload = () => setVal(String(r.result));
    r.readAsDataURL(f);
  };
  const clear = () => setVal('');
  const salvar = () => {
    if (val) localStorage.setItem(STORAGE_KEY, val); else localStorage.removeItem(STORAGE_KEY);
    aviso('Papel de parede guardado. A aplicar…');
    window.location.reload();
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden" style={{ background: TOKENS.canvas }}>
      <div className="flex items-center px-3 gap-3 flex-shrink-0 text-white" style={{ background: accentGradient(), height: 56 }}>
        {voltar && (
          <button onClick={voltar} title="Voltar ao Ambiente de Trabalho"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 flex-shrink-0">
            <ArrowLeft size={18} />
          </button>
        )}
        <Image size={18} className="flex-shrink-0 opacity-90" />
        <span className="font-semibold text-[15px]">Papel de Parede do Ambiente de Trabalho</span>
        <div className="ml-auto flex items-center gap-4 text-[13px]">
          <span className="font-semibold">{new Date().toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
          <span className="opacity-30">|</span>
          <span className="font-bold">{username}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white border border-[#CFE3E6] p-3 max-w-2xl">
          <p className="text-[11px] text-gray-600 mb-3">Fundo do Ambiente de Trabalho (POS/PMS). Recomendado 1920×1080 — uma fachada ou imagem do hotel fica melhor que uma cor lisa.</p>
          <div className="flex gap-3">
            <div className="w-52 h-32 bg-[#EEF4F5] border border-[#7FA9B1] flex items-center justify-center overflow-hidden flex-shrink-0">
              {val ? <img src={val} alt="pré-visualização" className="max-w-full max-h-full object-contain" /> : <Monitor size={30} className="text-gray-300" />}
            </div>
            <div className="flex-1 text-[11px] text-gray-600">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F7FAFA] border border-[#7FA9B1] shadow-[inset_1px_1px_0_#FFFFFF] text-[11px] cursor-pointer hover:bg-[#EEF4F5]">
                <Upload size={13} /> Escolher imagem…
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              {val && (
                <button onClick={clear} className="ml-2 inline-flex items-center gap-1 text-[#8C2B1F] hover:underline text-[11px]">
                  <Trash2 size={12} />Remover
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-[40px] bg-white border-t border-[#CFE3E6] flex items-center justify-between px-4 py-1.5 flex-shrink-0 gap-2">
        <ClassicButton icon={Save} label="Guardar e aplicar" onClick={salvar} />
        <div className="text-gray-600 text-[11px]">Aplica-se só a este terminal.</div>
      </div>
    </div>
  );
}
