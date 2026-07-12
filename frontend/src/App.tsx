import { useState } from 'react';
import DesktopShell from './components/shell/DesktopShell';
import EnterpriseDesktop from './components/desktop/EnterpriseDesktop';
import 'ag-grid-enterprise';

// Backoffice clássico (menu + ribbon + ÁRVORE à esquerda). A árvore mostra APENAS
// os centros do módulo ativo (PMS/Restauração/POS); os dos outros ficam ocultos.
function ClassicBackofficeApp({ initial, initialModule, onDesktop }: { initial: string; initialModule: string; onDesktop: () => void }) {
  const [activeView, setActiveView] = useState(initial);
  return (
    <div className="h-screen w-screen overflow-hidden font-sans">
      <DesktopShell activeView={activeView} onOpen={setActiveView} module={initialModule} onDesktop={onDesktop} />
    </div>
  );
}

/**
 * TROCA DE MÓDULO a partir de um ecrã que ocupa a janela toda (como a Configuração
 * POS, que não tem a moldura da shell). O ecrã deixa aqui o destino e recarrega;
 * a aplicação arranca já no módulo pedido, em vez de obrigar a passar pelo
 * Ambiente de Trabalho.
 */
const PEDIDO = 'ui_nav';
export const irParaModulo = (module: string, screen: string) => {
  localStorage.setItem(PEDIDO, JSON.stringify({ module, screen }));
  window.location.reload();
};

function lerPedido(): { screen: string; module: string } | null {
  try {
    const raw = localStorage.getItem(PEDIDO);
    if (!raw) return null;
    localStorage.removeItem(PEDIDO);   // é um pedido, não uma preferência
    const p = JSON.parse(raw);
    return p?.module && p?.screen ? p : null;
  } catch {
    return null;
  }
}

// Entrada = Ambiente de Trabalho (lançador). Abrir um ecrã → clássico DESSE módulo.
function App() {
  const [nav, setNav] = useState<{ screen: string; module: string } | null>(lerPedido);
  return nav === null
    ? <EnterpriseDesktop onOpen={(screen, module) => setNav({ screen, module })} />
    : <ClassicBackofficeApp initial={nav.screen} initialModule={nav.module} onDesktop={() => setNav(null)} />;
}

export default App;
