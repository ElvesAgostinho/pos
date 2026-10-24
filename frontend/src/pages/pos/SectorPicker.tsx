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
        {/* UM SETOR SEM PONTO DE VENDA NÃO SERVE — e não pode parecer que serve.
            Um cliente gravou um setor sem ponto de venda (a lista aparecia-lhe
            vazia) e o terminal mostrava-o como qualquer outro: escolhia-se,
            abria-se uma SESSÃO DE CAIXA — dinheiro num setor que não pertence a
            lado nenhum — e o ecrã seguinte dizia "este setor não tem mesas",
            culpando as mesas por um problema que é de outro sítio. Aqui fica
            visível, mas por escolher, e com a razão à frente. */}
        {setores.map((s: any) => {
          const servivel = !!(s.outlet ?? s.outlet_id);
          return (
            <button key={s.id} disabled={!servivel}
              onClick={() => servivel && onPick(s)}
              title={servivel ? undefined : 'Setor sem ponto de venda'}
              className={`w-full min-h-[68px] px-5 mb-1.5 flex items-center text-left text-[20px]
                rounded-md transition ${servivel
                  ? 'text-white bg-[#3a3a3a] hover:bg-[#4a4a4a] active:bg-[#0f8b8d]'
                  : 'text-white/45 bg-[#2b2b2b] cursor-not-allowed'}`}>
              <span className={`w-2 h-8 rounded mr-4 ${servivel ? 'bg-[#0f8b8d]' : 'bg-[#7a4a4a]'}`} />
              <span className="flex-1 py-2">
                {s.name}
                {!servivel && (
                  <span className="block text-[12px] leading-snug text-[#e5a0a0] mt-1">
                    Sem ponto de venda — este setor não consegue servir. Escolha-o na ficha
                    do setor (Configuração POS › Parâmetros do Sistema › Setores).
                  </span>
                )}
              </span>
            </button>
          );
        })}
        {!isLoading && setores.length === 0 && (
          <div className="text-white/60 text-center px-6 py-10 text-sm">
            Não há setores configurados. Crie-os em <b>Configuração POS › Parâmetros › Setores</b>.
          </div>
        )}
      </div>
    </Window>
  );
}
