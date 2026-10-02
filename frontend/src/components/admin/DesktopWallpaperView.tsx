import { useState } from 'react';
import ClassicButton from '../ui/ClassicButton';
import { ArrowLeft, Image, Upload, Trash2, Monitor, Save } from 'lucide-react';
import { aviso } from '../../ui/dialogo';
import { TOKENS, accentGradient } from '../../config/theme';

/** Chave por omissão — o papel de parede do Ambiente de Trabalho. O PMS passa a
    sua (`ui_wallpaper_pms`) e fica com um fundo próprio, sem um segundo ecrã:
    o trabalho (escolher ficheiro, limitar o tamanho, pré-visualizar, guardar por
    terminal) é o mesmo, só muda onde se guarda e o título. */
const CHAVE_AMBIENTE = 'ui_wallpaper';

/** SÓ o papel de parede do Ambiente de Trabalho — nome da empresa, logótipo e
    cor da barra já têm os seus próprios ecrãs (Empresa, Personalização de
    cores) e não se repetem aqui. Guardado por terminal (localStorage), como
    o resto da Aparência: EnterpriseDesktop.tsx lê esta mesma chave.

    Barra de cima igual à do Ambiente de Trabalho / Configuração POS (mesmo
    fundo, mesma altura) — não a moldura genérica do ClassicWindow, para não
    ter um estilo de cabeçalho diferente só neste ecrã. */
export default function DesktopWallpaperView({ onBack, onDesktop, storageKey, title, hint }: {
  onBack?: () => void; onDesktop?: () => void;
  storageKey?: string; title?: string; hint?: string;
}) {
  const chave = storageKey || CHAVE_AMBIENTE;
  const [val, setVal] = useState<string>(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem(chave) : null) || '');
  const voltar = onDesktop || onBack;
  const username = JSON.parse(localStorage.getItem('erp_user') || '{}').username || 'operador';

  /**
   * A imagem é REDUZIDA antes de ser guardada, não guardada como veio.
   *
   * O papel de parede vive no armazenamento do browser, que tem ~5 MB NO TOTAL
   * para toda a aplicação. Uma fotografia de 3 MB vira ~4 MB em base64 e enche-o
   * sozinha; com dois papéis de parede (o do Ambiente de Trabalho e o do PMS),
   * o segundo rebentava a gravar — era o erro "Uncaught" que aparecia ao clicar
   * em Guardar, sem dizer porquê.
   *
   * 1920 de largura chega para qualquer ecrã de recepção, e em JPEG a 82% uma
   * fotografia dessas ocupa 200 a 400 KB. Fica melhor à vista e cabe à vontade.
   */
  const MAX_LARGURA = 1920;

  const reduzir = (dataUrl: string) => new Promise<string>((resolver) => {
    const img = new window.Image();
    img.onload = () => {
      const escala = Math.min(1, MAX_LARGURA / (img.width || MAX_LARGURA));
      if (escala >= 1 && dataUrl.length < 600_000) { resolver(dataUrl); return; }
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      const ctx = c.getContext('2d');
      if (!ctx) { resolver(dataUrl); return; }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      try { resolver(c.toDataURL('image/jpeg', 0.82)); }
      catch { resolver(dataUrl); }   // imagem de outra origem: fica como está
    };
    img.onerror = () => resolver(dataUrl);
    img.src = dataUrl;
  });

  const onFile = (f?: File) => {
    if (!f) return;
    if (f.size > 12_000_000) { aviso('Imagem demasiado grande (máx. ~12 MB).'); return; }
    const r = new FileReader();
    r.onload = async () => setVal(await reduzir(String(r.result)));
    r.readAsDataURL(f);
  };

  const clear = () => setVal('');

  const salvar = () => {
    // Guardar pode falhar por falta de espaço — e falhar em silêncio, ou com um
    // "Uncaught" na cara do utilizador, é pior do que dizer o que se passou e o
    // que ele pode fazer a seguir.
    try {
      if (val) localStorage.setItem(chave, val); else localStorage.removeItem(chave);
    } catch {
      const outro = chave === CHAVE_AMBIENTE ? 'ui_wallpaper_pms' : CHAVE_AMBIENTE;
      const temOutro = !!localStorage.getItem(outro);
      aviso('Não há espaço no armazenamento deste terminal para guardar a imagem.\n\n'
        + (temOutro
          ? 'Há outro papel de parede guardado neste terminal (o do '
            + (outro === CHAVE_AMBIENTE ? 'Ambiente de Trabalho' : 'PMS')
            + '). Remova-o, ou escolha uma imagem mais pequena.'
          : 'Escolha uma imagem mais pequena.'), 'Papel de parede');
      return;
    }
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
        <span className="font-semibold text-[15px]">{title || 'Papel de Parede do Ambiente de Trabalho'}</span>
        <div className="ml-auto flex items-center gap-4 text-[13px]">
          <span className="font-semibold">{new Date().toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
          <span className="opacity-30">|</span>
          <span className="font-bold">{username}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white border border-[#D7DBDF] p-3 max-w-2xl">
          <p className="text-[11px] text-gray-600 mb-3">{hint
            || 'Fundo do Ambiente de Trabalho (POS/PMS). A imagem é reduzida para 1920 de largura ao guardar — escolha a melhor que tiver, que o sistema trata do tamanho. Uma fachada ou imagem do hotel fica melhor que uma cor lisa.'}</p>
          <div className="flex gap-3">
            <div className="w-52 h-32 bg-[#F3F4F6] border border-[#D7DBDF] flex items-center justify-center overflow-hidden flex-shrink-0">
              {val ? <img src={val} alt="pré-visualização" className="max-w-full max-h-full object-contain" /> : <Monitor size={30} className="text-gray-300" />}
            </div>
            <div className="flex-1 text-[11px] text-gray-600">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F3F4F6] border border-[#D7DBDF] shadow-[inset_1px_1px_0_#FFFFFF] text-[11px] cursor-pointer hover:bg-[#F3F4F6]">
                <Upload size={13} /> Escolher imagem…
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              {val && (
                <button onClick={clear} className="ml-2 inline-flex items-center gap-1 text-[#912018] hover:underline text-[11px]">
                  <Trash2 size={12} />Remover
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-[40px] bg-white border-t border-[#D7DBDF] flex items-center justify-between px-4 py-1.5 flex-shrink-0 gap-2">
        <ClassicButton icon={Save} label="Guardar e aplicar" onClick={salvar} />
        <div className="text-gray-600 text-[11px]">Aplica-se só a este terminal.</div>
      </div>
    </div>
  );
}
