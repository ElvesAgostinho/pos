import { useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { apiClient } from '../../api/client';
import { useFeatures } from '../../hooks/useActiveModules';
import { ToggleLeft, ToggleRight, SlidersHorizontal } from 'lucide-react';

const MOD_NAME: Record<string, string> = {
  pos: 'POS / Restauração', commercial: 'Comercial', fiscal: 'Fiscal',
  pms: 'PMS (Hotel)', ops: 'Operações', integration: 'Integrações',
};

export default function FeatureFlagsView() {
  const qc = useQueryClient();
  const { data } = useFeatures();
  const catalog = data?.catalog || [];
  const toggle = async (key: string, enabled: boolean) => {
    try {
      await apiClient.post('licensing/features/', { key, enabled });
      qc.invalidateQueries({ queryKey: ['licensing', 'features'] });
    } catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); }
  };
  // agrupa por módulo
  const groups: Record<string, any[]> = {};
  catalog.forEach((f: any) => { (groups[f.module] = groups[f.module] || []).push(f); });

  return (
    <ClassicWindow title="Funcionalidades (Licenciamento por Módulo)" icon={<SlidersHorizontal size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Ligue/desligue funcionalidades dentro dos módulos licenciados · os ecrãs desligados desaparecem do menu</div>}>
      <div className="p-4 space-y-4 bg-[#e6e6e6] h-full overflow-auto">
        {Object.entries(groups).map(([mod, feats]) => (
          <div key={mod} className="bg-white border border-[#c0c0c0]">
            <div className="px-3 py-1.5 bg-[#1e3f66] text-white text-[12px] font-bold">{MOD_NAME[mod] || mod}</div>
            {feats.map((f: any) => (
              <div key={f.key} className="flex items-center justify-between px-3 py-2 border-b border-[#eee] text-[13px]">
                <div>
                  <div className="font-semibold">{f.name}</div>
                  <div className="text-[10px] text-gray-500 font-mono">{f.key}</div>
                </div>
                <button onClick={() => toggle(f.key, !f.active)} className="flex items-center gap-1.5 font-bold" style={{ color: f.active ? '#1f9d55' : '#999' }}>
                  {f.active ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}{f.active ? 'Ativa' : 'Desligada'}
                </button>
              </div>
            ))}
          </div>
        ))}
        {catalog.length === 0 && <div className="text-gray-500 text-[12px]">Sem funcionalidades para os módulos ativos.</div>}
      </div>
    </ClassicWindow>
  );
}
