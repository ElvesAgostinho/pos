import { useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import { Image, Upload, Trash2, Monitor, Type, Palette, Save } from 'lucide-react';

const read = (k: string) => (typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null) || '';

function ImagePicker({ label, storageKey, hint }: { label: string; storageKey: string; hint: string }) {
  const [val, setVal] = useState<string>(read(storageKey));
  const onFile = (f?: File) => {
    if (!f) return;
    if (f.size > 3_000_000) { alert('Imagem demasiado grande (máx. ~3 MB).'); return; }
    const r = new FileReader();
    r.onload = () => { const d = String(r.result); localStorage.setItem(storageKey, d); setVal(d); };
    r.readAsDataURL(f);
  };
  const clear = () => { localStorage.removeItem(storageKey); setVal(''); };
  return (
    <div className="bg-[#f0f0f0] border border-[#c0c0c0] p-3">
      <div className="flex items-center gap-2 mb-2 text-[#1e3f66] font-bold text-[12px]"><Image size={14} />{label}</div>
      <div className="flex gap-3">
        <div className="w-40 h-24 bg-white border border-[#a0a0a0] flex items-center justify-center overflow-hidden">
          {val ? <img src={val} alt="preview" className="max-w-full max-h-full object-contain" /> : <Monitor size={26} className="text-gray-300" />}
        </div>
        <div className="flex-1 text-[11px] text-gray-600">
          <p className="mb-2">{hint}</p>
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#f0f0f0] border border-[#a0a0a0] shadow-[inset_1px_1px_0_#fff] text-[11px] cursor-pointer hover:bg-[#e8e8e8]">
            <Upload size={13} /> Escolher imagem…
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {val && <button onClick={clear} className="ml-2 inline-flex items-center gap-1 text-red-600 hover:text-red-800 text-[11px]"><Trash2 size={12} />Remover</button>}
        </div>
      </div>
    </div>
  );
}

function TextSetting({ label, storageKey, placeholder }: { label: string; storageKey: string; placeholder: string }) {
  const [val, setVal] = useState<string>(read(storageKey));
  const save = (v: string) => { setVal(v); if (v) localStorage.setItem(storageKey, v); else localStorage.removeItem(storageKey); };
  return (
    <label className="flex items-center gap-2 text-[12px]">
      <span className="w-40 text-right text-gray-700">{label}:</span>
      <input value={val} placeholder={placeholder} onChange={(e) => save(e.target.value)} className="flex-1 border border-[#a0a0a0] px-2 py-1.5 bg-white" />
    </label>
  );
}

export default function AppearanceView() {
  const [bar, setBar] = useState<string>(read('ui_bar_color') || '#1e3f66');
  const saveBar = (v: string) => { setBar(v); localStorage.setItem('ui_bar_color', v); };
  return (
    <ClassicWindow title="Personalização / Aparência" icon={<Image size={14} className="text-gray-300" />}
      footer={<>
        <ClassicButton icon={Save} label="Guardar e aplicar" onClick={() => { alert('Aparência guardada. A aplicar em todo o sistema…'); window.location.reload(); }} />
        <div className="text-gray-600">As definições guardam-se automaticamente neste terminal; "Guardar e aplicar" recarrega para aplicar em todo o lado (login, ambiente e barras).</div>
      </>}>
      <div className="p-4 space-y-4 bg-[#e6e6e6] h-full overflow-auto">
        <div className="bg-[#f0f0f0] border border-[#c0c0c0] p-3">
          <div className="flex items-center gap-2 mb-3 text-[#1e3f66] font-bold text-[12px]"><Type size={14} />Identidade</div>
          <div className="space-y-2">
            <TextSetting label="Nome da empresa" storageKey="ui_company_name" placeholder="System Mwana Lodge" />
            <TextSetting label="Nome do ERP" storageKey="ui_erp_name" placeholder="System Mwana Lodge" />
            <TextSetting label="Texto de boas-vindas" storageKey="ui_welcome_text" placeholder="Bem-vindo. Inicie sessão para continuar." />
            <label className="flex items-center gap-2 text-[12px]">
              <span className="w-40 text-right text-gray-700 flex items-center justify-end gap-1"><Palette size={13} />Cor da barra:</span>
              <input type="color" value={bar} onChange={(e) => saveBar(e.target.value)} className="w-12 h-8 border border-[#a0a0a0] bg-white" />
              <span className="text-gray-500">{bar}</span>
              <button onClick={() => saveBar('#1e3f66')} className="text-[#1e3f66] hover:underline">repor</button>
            </label>
          </div>
        </div>
        <ImagePicker label="Logótipo (login e cabeçalhos)" storageKey="ui_login_logo"
          hint="Logótipo mostrado no login e nos cabeçalhos. PNG com fundo transparente fica melhor." />
        <ImagePicker label="Imagem do ecrã de login" storageKey="ui_login_bg"
          hint="Imagem de fundo do ecrã de login (ex.: fachada do hotel). Recomendado 1920×1080." />
        <ImagePicker label="Papel de parede do ambiente de trabalho" storageKey="ui_wallpaper"
          hint="Fundo dos módulos. Recomendado 1920×1080." />
        <div className="text-[11px] text-gray-500">Cada cliente usa a sua identidade sem alterar o código. Para aplicar a todos os terminais, defina em cada um (ou, no futuro, via servidor de configuração).</div>
      </div>
    </ClassicWindow>
  );
}
