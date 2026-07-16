import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';

/**
 * ABERTURA DE CAIXA — o segundo passo, e não se salta.
 *
 * O FUNDO é o dinheiro que está na gaveta ANTES de se vender o primeiro café. Sem ele
 * declarado, o fecho de caixa nunca bate: o dinheiro que lá estava aparece como sobra e
 * ninguém sabe se é troco antigo ou uma venda que não foi registada.
 *
 * Se já houver uma caixa aberta neste ponto de venda, não se abre outra — entra-se nela.
 * Duas caixas abertas no mesmo sítio é a forma mais simples de ter dinheiro em dois
 * sítios e contagem em nenhum.
 */
export default function CashOpen({ setor, operador, onOpened, onBack }: {
  setor: any; operador: any;
  onOpened: (s: any) => void;
  onBack: () => void;
}) {
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState('');

  // Já há caixa aberta aqui?
  const { data: aberta, isLoading } = useQuery({
    queryKey: ['pos-cash-open', setor?.outlet],
    queryFn: async () => {
      const r = await apiClient.get('pos/cash-sessions/', { params: { status: 'OPEN' } });
      const lista = (r.data?.results || r.data || []) as any[];
      return lista.find((s) => s.status === 'OPEN' && s.outlet === setor.outlet) || null;
    },
  });

  const abrir = useMutation({
    mutationFn: async () => (await apiClient.post('pos/cash-sessions/', {
      outlet: setor.outlet,
      operator_name: operador?.name || 'Operador',
      terminal_name: setor.name,
      opening_float: valor || '0',
    })).data,
    onSuccess: (s) => onOpened(s),
    onError: (e: any) => setErro(e?.response?.data?.detail || 'Não foi possível abrir a caixa.'),
  });

  const tecla = (t: string) => {
    if (t === 'C') return setValor('');
    if (t === '⌫') return setValor(valor.slice(0, -1));
    if (t === '.' && valor.includes('.')) return;
    setValor(valor + t);
  };

  if (isLoading) {
    return <div className="absolute inset-0 flex items-center justify-center text-white/60">A verificar a caixa…</div>;
  }

  // Caixa já aberta — entra-se nela, não se abre outra.
  if (aberta) {
    return (
      <Window title="Caixa já aberta" width={480} tone="#0f8b8d"
        footer={(
          <div className="flex">
            <button onClick={onBack} className="flex-1 h-[62px] bg-[#3a3a3a] text-white text-[18px]">◀ Setor</button>
            <button onClick={() => onOpened(aberta)}
              className="flex-1 h-[62px] bg-[#1f7a34] text-white text-[18px] font-bold">Entrar na caixa ▶</button>
          </div>
        )}>
        <div>
          <div className="p-6 text-white space-y-2 text-[16px]">
            <div>Ponto de venda: <b>{setor.name}</b></div>
            <div>Operador: <b>{aberta.operator_name}</b></div>
            <div>Fundo: <b>{Number(aberta.opening_float).toLocaleString('pt-PT')} Kz</b></div>
            <p className="text-white/50 text-[13px] pt-2">
              Não se abrem duas caixas no mesmo sítio: o dinheiro ficaria em dois sítios e a
              contagem em nenhum.
            </p>
          </div>
        </div>
      </Window>
    );
  }

  return (
    <Window title={`Abertura de Caixa — ${setor.name}`} width={480} tone="#0f8b8d"
      footer={(
        <div className="flex">
          <button onClick={onBack} className="flex-1 h-[64px] bg-[#3a3a3a] text-white text-[18px]">◀ Setor</button>
          <button onClick={() => abrir.mutate()} disabled={abrir.isPending}
            className="flex-1 h-[64px] bg-[#1f7a34] text-white text-[20px] font-bold disabled:bg-[#555]">
            {abrir.isPending ? 'A abrir…' : '✔ Abrir Caixa'}
          </button>
        </div>
      )}>
      <div>
        <div className="p-4">
          <div className="text-white/70 text-[15px] mb-1">
            Fundo de maneio (o que está na gaveta agora)
          </div>
          <div className="h-[64px] bg-black text-white text-right text-[34px] font-bold px-4
            flex items-center justify-end border border-[#4a4a4a]">
            {valor || '0'} <span className="text-[20px] text-white/40 ml-2">Kz</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 mt-3">
            {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'].map((t) => (
              <button key={t} onClick={() => tecla(t)}
                className="h-[50px] bg-[#3a3a3a] text-white text-[20px] font-bold rounded active:bg-[#0f8b8d]">
                {t}
              </button>
            ))}
          </div>

          {erro && <div className="mt-3 text-[#ff8a80] text-[14px]">{erro}</div>}
        </div>
      </div>
    </Window>
  );
}
