import React from 'react';
import { VIEW_REGISTRY, ITEM_TITLES, MODULE_OF } from '../config/navigation';
import ClassicWindow from './ui/ClassicWindow';
import ModuleDesktop from './ModuleDesktop';
import { Construction } from 'lucide-react';

export const TabContext = React.createContext<{ onClose?: () => void }>({});

interface MainContentProps {
  activeView: string;
  onClose?: () => void;
  onSelectView?: (id: string) => void;
}

function Placeholder({ id }: { id: string }) {
  const title = ITEM_TITLES[id] || id;
  const moduleTitle = MODULE_OF[id] || '';
  return (
    <ClassicWindow title={title}>
      <div className="h-full w-full bg-[#F7FAFA] flex items-center justify-center p-6">
        <div className="bg-[#F7FAFA] border-2 border-white border-b-[#7FA9B1] border-r-[#7FA9B1] p-8 max-w-lg text-center">
          <div className="w-14 h-14 mx-auto mb-4 bg-white border border-[#CFE3E6] rounded-full flex items-center justify-center">
            <Construction size={26} className="text-[#5C8891]" />
          </div>
          {moduleTitle && <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">{moduleTitle}</div>}
          <h2 className="text-lg font-bold text-[#5C8891] mb-2">{title}</h2>
          <div className="inline-block text-[10px] font-bold text-[#0B4F5C] bg-[#F7FAFA] border border-[#7FA9B1] px-2 py-0.5 rounded mb-2">EM DESENVOLVIMENTO</div>
          <p className="text-[12px] text-gray-600">
            Não é um erro. Este ecrã está a ser construído — o módulo <b>está ativo na sua licença</b>,
            mas esta função específica ainda vai ser disponibilizada.
          </p>
          <p className="text-[11px] text-gray-500 mt-2">
            As funções já operacionais têm o ícone a cores/preto com ponto verde no ambiente de trabalho.
          </p>
        </div>
      </div>
    </ClassicWindow>
  );
}

export default function MainContent({ activeView, onClose, onSelectView }: MainContentProps) {
  const renderView = () => {
    // Ambiente de trabalho do módulo (ecrã inicial com atalhos).
    if (activeView.startsWith('home:')) {
      return <ModuleDesktop moduleKey={activeView.slice(5)} activeView={activeView} onOpen={(id) => onSelectView && onSelectView(id)} />;
    }
    const Real = VIEW_REGISTRY[activeView];
    if (Real) return <Real />;
    return <Placeholder id={activeView} />;
  };

  return (
    <TabContext.Provider value={{ onClose }}>
      <div className="flex-1 flex flex-col bg-white relative">
        {renderView()}
      </div>
    </TabContext.Provider>
  );
}
