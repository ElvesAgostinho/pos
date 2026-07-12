import { useState } from 'react';
import DesktopShell from './components/shell/DesktopShell';
import EnterpriseDesktop from './components/desktop/EnterpriseDesktop';
import 'ag-grid-enterprise';

// Backoffice clássico (menu + ribbon + ÁRVORE à esquerda). A árvore mostra APENAS
// os centros do módulo ativo (PMS/Restauração/POS); os dos outros ficam ocultos.
function ClassicBackofficeApp({ initial, initialModule, onDesktop }: { initial: string; initialModule: string; onDesktop: () => void }) {
  const [activeView, setActiveView] = useState(initial);
  // O módulo é FIXO nesta sessão do clássico — para trocar, volta-se ao Ambiente de Trabalho.
  return (
    <div className="h-screen w-screen overflow-hidden font-sans">
      <DesktopShell activeView={activeView} onOpen={setActiveView} module={initialModule} onDesktop={onDesktop} />
    </div>
  );
}

// Entrada = Ambiente de Trabalho (lançador). Abrir um ecrã → clássico DESSE módulo.
function App() {
  const [nav, setNav] = useState<{ screen: string; module: string } | null>(null);
  return nav === null
    ? <EnterpriseDesktop onOpen={(screen, module) => setNav({ screen, module })} />
    : <ClassicBackofficeApp initial={nav.screen} initialModule={nav.module} onDesktop={() => setNav(null)} />;
}

export default App;
