import { useNavigate } from 'react-router-dom';
import { MODULES, moduleEnabled } from '../config/navigation';
import { useActiveModules } from '../hooks/useActiveModules';
import { tokenStore, authApi } from '../api/auth';
import {
  LogOut, Wrench, Key, ShieldCheck, Hotel, FolderArchive, TrendingUp, Handshake,
  ShoppingCart, Warehouse, UtensilsCrossed, ConciergeBell, CreditCard, Monitor, Wallet,
  Landmark, BarChart3, Workflow, FileText, Bell, Plug, Settings, Folder,
} from 'lucide-react';

// Ícone por módulo — Launchpad estilo enterprise (Oracle/SAP Fiori). Traço da
// lucide-react, não emoji: um emoji muda de forma entre Windows/Android/iPhone
// e vem colorido em cima do cartão branco — aqui é sempre o mesmo traço fino.
const ICONS: Record<string, any> = {
  admin: Wrench, licensing: Key, security: ShieldCheck, hotel: Hotel, masterdata: FolderArchive,
  commercial: TrendingUp, srm: Handshake, procurement: ShoppingCart, warehouse: Warehouse,
  hospitality: UtensilsCrossed, pms: ConciergeBell, posmgmt: CreditCard, posfront: Monitor,
  financial: Wallet, fiscal: Landmark, reporting: BarChart3, workflow: Workflow,
  documents: FileText, notifications: Bell, integration: Plug, system: Settings,
};

export default function Launchpad() {
  const navigate = useNavigate();
  const user = tokenStore.getUser();
  const { data: lic } = useActiveModules();
  const active = lic?.active || [];
  const modules = MODULES.filter((m) => moduleEnabled(m.key, active));

  const open = (mod: any) => {
    if (mod.key === 'posfront') { window.open('/pos/login', '_blank'); return; }
    // Abre o módulo no seu próprio separador, no ambiente de trabalho (desktop) do módulo.
    window.open(`/backoffice#home:${mod.key}`, '_blank');
  };
  const logout = async () => { await authApi.logout(); navigate('/backoffice/login'); };

  return (
    <div className="min-h-screen bg-[#eef1f5] font-sans">
      <div className="h-14 bg-[#1e3f66] flex items-center px-5 text-white">
        <span className="font-bold text-lg tracking-wide">System Mwana Lodge</span>
        <span className="ml-3 text-white/70 text-sm">· Launchpad</span>
        <div className="flex-1" />
        <span className="text-sm text-white/90 mr-4">{user?.name || user?.username}</span>
        <button onClick={logout} className="flex items-center gap-1.5 text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded">
          <LogOut size={14} /> Sair
        </button>
      </div>

      <div className="p-6">
        <div className="text-gray-500 text-sm mb-4">
          Selecione um módulo — abre no seu próprio separador do navegador, mantendo a mesma sessão.
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
          {modules.map((mod) => {
            const Ico = ICONS[mod.key] || Folder;
            return (
              <button key={mod.key} onClick={() => open(mod)}
                className="bg-white border border-[#d5dbe3] rounded-lg p-4 text-left shadow-sm hover:shadow-md hover:border-[#1e3f66] transition group">
                <div className="text-[#1e3f66] mb-2"><Ico size={30} strokeWidth={1.8} /></div>
                <div className="font-bold text-[#1e3f66] text-sm leading-tight group-hover:underline">{mod.title}</div>
                <div className="text-gray-400 text-xs mt-1">{mod.items.length} opções</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
