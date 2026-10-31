import { useState } from 'react';
import DesktopShell from './components/shell/DesktopShell';
import { lerPedido } from './config/navegar';
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

// A troca de módulo mudou-se para config/navegar.ts, porque o shell também
// precisa dela (a tira de módulos da extrema esquerda) e dois ficheiros a
// importarem-se um ao outro é um ciclo à espera de rebentar. Reexporta-se aqui
// para quem já a conhecia por este nome continuar a encontrá-la.
export { irParaModulo } from './config/navegar';

// Entrada = Ambiente de Trabalho (lançador). Abrir um ecrã → clássico DESSE módulo.
function App() {
  const [nav, setNav] = useState<{ screen: string; module: string } | null>(lerPedido);
  return nav === null
    ? <EnterpriseDesktop onOpen={(screen, module) => setNav({ screen, module })} />
    : <ClassicBackofficeApp initial={nav.screen} initialModule={nav.module} onDesktop={() => setNav(null)} />;
}

export default App;
