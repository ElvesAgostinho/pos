import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import { Image, Upload, Trash2, Monitor, Save } from 'lucide-react';
import { aviso } from '../../ui/dialogo';

const STORAGE_KEY = 'ui_wallpaper';
const read = () => (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null) || '';

/** SÓ o papel de parede do Ambiente de Trabalho — nome da empresa, logótipo e
    cor da barra já têm os seus próprios ecrãs (Empresa, Personalização de
    cores) e não se repetem aqui. Guardado por terminal (localStorage), como
    o resto da Aparência: EnterpriseDesktop.tsx lê esta mesma chave. */
export default function DesktopWallpaperView({ onBack, onDesktop }: { onBack?: () => void; onDesktop?: () => void }) {
  const [val, setVal] = useState<string>(read());
  const voltar = onDesktop || onBack;

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
    <ClassicWindow title="Papel de Parede do Ambiente de Trabalho" icon={<Image size={14} className="text-gray-300" />}
      onClose={voltar}
      footer={<>
        <ClassicButton icon={Save} label="Guardar e aplicar" onClick={salvar} />
        <div className="text-gray-600">Aplica-se só a este terminal.</div>
      </>}>
      <div className="p-4 bg-[#F7FAFA] h-full overflow-auto">
        <div className="bg-white border border-[#CFE3E6] p-3">
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
    </ClassicWindow>
  );
}
