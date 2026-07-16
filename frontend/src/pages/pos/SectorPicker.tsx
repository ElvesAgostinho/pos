import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';

/**
 * SELETOR DE SETOR — a primeira coisa a seguir ao login.
 *
 * O setor decide o TECLADO que o empregado vê, o NÍVEL DE PREÇO que se cobra (o mesmo gin
 * custa mais no Rooftop), o ARMAZÉM de onde sai o stock e o HAPPY HOUR em vigor. Servir o
 * Rooftop com o setor do Restaurante escolhido é vender ao preço errado a noite inteira.
 */
export default function SectorPicker({ sectors, onPick, onCancel }: {
  // A lista vem do BOOTSTRAP, já filtrada pela caixa "Todos os setores" do operador.
  // O empregado do Lounge não vê o Rooftop — nem por engano.
  sectors?: any[];
  onPick: (s: any) => void;
  onCancel?: () => void;
}) {
  const { data: carregados = [], isLoading } = useQuery({
    queryKey: ['pos-sectors'],
    queryFn: async () => {
      const r = await apiClient.get('pos/config/sectors/');
      return ((r.data?.results || r.data || []) as any[]).filter((s) => s.is_active);
    },
    enabled: !sectors,          // só se o bootstrap não os trouxe
  });
  const setores = sectors ?? carregados;

  return (
    <Window title="Setor" width={460} tone="#0f8b8d" onClose={onCancel}>
      <div className="p-2">
        {isLoading && <div className="text-white/50 text-center py-10">A carregar…</div>}
        {setores.map((s: any) => (
          <button key={s.id} onClick={() => onPick(s)}
            className="w-full h-[68px] px-5 mb-1.5 flex items-center text-left text-white text-[20px]
              bg-[#3a3a3a] rounded-md hover:bg-[#4a4a4a] active:bg-[#0f8b8d] transition">
            <span className="w-2 h-8 rounded bg-[#0f8b8d] mr-4" />
            {s.name}
          </button>
        ))}
        {!isLoading && setores.length === 0 && (
          <div className="text-white/60 text-center px-6 py-10 text-sm">
            Não há setores configurados. Crie-os em <b>Configuração POS › Parâmetros › Setores</b>.
          </div>
        )}
      </div>
    </Window>
  );
}
