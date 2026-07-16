import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiClient } from '../../api/client';
import GuestsDialog from './GuestsDialog';
import GuestPick from './GuestPick';

/**
 * MAPA DE MESAS — a planta da sala, não uma grelha de botões.
 *
 * Cada mesa está onde está mesmo (posição, forma e tamanho vêm da configuração), porque
 * o empregado não procura a "mesa 7": procura a mesa ao pé da janela. Uma grelha
 * alfabética obriga-o a traduzir o que vê para o que o ecrã mostra — e é aí que se erra
 * de mesa e se serve o prato ao cliente errado.
 *
 * O PONTO no canto diz o estado num relance:
 *   verde = livre · vermelho = ocupada (tem conta) · amarelo = reservada
 *   cinzento = limpeza/bloqueada
 *
 * Tocar numa mesa livre ABRE a conta; tocar numa ocupada RETOMA a que já existe. Nunca
 * se abre uma segunda conta na mesma mesa — era assim que metade do jantar ficava numa
 * conta e a outra metade noutra.
 */

const PONTO: Record<string, string> = {
  FREE: '#2ecc40',
  OCCUPIED: '#e02020',
  RESERVED: '#f0c000',
  DIRTY: '#9a9a9a',
  BLOCKED: '#6a6a6a',
  MAINTENANCE: '#6a6a6a',
};

export default function TableMap({ setor, onOpenTicket, modo = 'ORDER', onPayTicket,
  onViewTicket, onDirectSale, perguntarTipo = true, refrescar = 8000,
  mostrarPagamento = false, fundo = true }: {
  setor: any;
  onOpenTicket: (ticketId: number) => void;
  // Vêm dos PARÂMETROS do backoffice (8175 e 8063): perguntar o tipo de cliente, e de
  // quanto em quanto tempo o mapa é re-lido do servidor.
  perguntarTipo?: boolean;
  refrescar?: number;
  // MODO: o que acontece ao tocar numa mesa.
  //   ORDER — abre (ou retoma) a conta para lançar artigos;
  //   PAY   — vai direto a Pagamentos (o empregado que vem cobrar não quer o teclado);
  //   VIEW  — Consulta de Mesa: mostra o talão de conferência, sem abrir a venda.
  modo?: 'ORDER' | 'PAY' | 'VIEW';
  onPayTicket?: (ticket: any) => void;
  onViewTicket?: (ticket: any) => void;
  // "Passante" no diálogo da mesa NÃO abre a mesa: vai direto à venda de balcão.
  onDirectSale?: () => void;
  // (8084) mostrar o estado do pagamento na mesa; (8271) usar a cor de fundo do setor.
  mostrarPagamento?: boolean;
  fundo?: boolean;
}) {
  const qc = useQueryClient();
  // A mesa que se acabou de tocar e ainda não tem conta: falta perguntar quantos são.
  const [aSentar, setASentar] = useState<any | null>(null);
  // Mesa de HÓSPEDE acabada de abrir: falta dizer QUEM (a lista do PMS, não à mão).
  const [escolherHospede, setEscolherHospede] = useState<number | null>(null);

  const { data: mesas = [], isLoading } = useQuery({
    queryKey: ['pos-tables', setor?.id],
    queryFn: async () => {
      // O SERVIDOR diz que mesas tem este setor — as mesmas da planta do backoffice
      // (Configuração POS › Setores). Apagar lá é desaparecer aqui. Sem fallbacks:
      // era um fallback por outlet que fazia aparecer mesas "fantasma" já removidas.
      const r = await apiClient.get('pos/tables/', { params: { sector: setor.id } });
      return (r.data?.results || r.data || []) as any[];
    },
    refetchInterval: refrescar,   // outro empregado abriu uma conta: o mapa tem de saber
  });

  const { data: contas = [] } = useQuery({
    queryKey: ['pos-open-tickets'],
    queryFn: async () => {
      const r = await apiClient.get('pos/tickets/', { params: { status: 'OPEN' } });
      return ((r.data?.results || r.data || []) as any[]).filter((t) => t.status === 'OPEN');
    },
    refetchInterval: refrescar,
  });

  const contaDa = (mesaId: number) => contas.find((t: any) => t.table === mesaId);

  const abrir = useMutation({
    mutationFn: async ({ mesa, pax, tipo }: any) => (await apiClient.post('pos/tickets/', {
      outlet: mesa.outlet,
      table: mesa.id,
      guests: pax,
      guest_type: tipo,
      operator_name: (JSON.parse(localStorage.getItem('pos_operator') || '{}').name) || 'Operador',
    })).data,
    onSuccess: (t) => {
      setASentar(null);
      qc.invalidateQueries({ queryKey: ['pos-open-tickets'] });
      // HÓSPEDE: antes de lançar, diz-se QUEM é — a conta leva o nome do PMS
      // (parâmetros 8035/8064/8147 mandam na lista). Sem isto, "Hotel" era só
      // uma etiqueta e a fatura saía Consumidor Final.
      if (t.guest_type === 'HOTEL') setEscolherHospede(t.id);
      else onOpenTicket(t.id);
    },
    onError: (e: any) => alert(e?.response?.data?.detail || 'Não foi possível abrir a conta.'),
  });

  const tocar = (m: any) => {
    const conta = contaDa(m.id);
    if (modo === 'VIEW') {
      // Consulta: só mostra — nunca abre o teclado. Mesa livre não tem o que consultar.
      if (!conta) return alert(`A mesa ${m.table_number} está livre — sem consumo.`);
      return onViewTicket?.(conta);
    }
    if (modo === 'PAY') {
      // A cobrar: só interessam as mesas COM conta. Uma mesa livre não tem o que pagar.
      if (!conta) return alert(`A mesa ${m.table_number} está livre — não há nada a cobrar.`);
      return onPayTicket?.(conta);
    }
    if (conta) return onOpenTicket(conta.id);          // retoma a conta que já existe
    if (['BLOCKED', 'MAINTENANCE'].includes(m.status)) {
      return alert(`A mesa ${m.table_number} está ${m.status === 'BLOCKED' ? 'bloqueada' : 'em manutenção'}.`);
    }
    // Mesa livre: antes de abrir a conta, PERGUNTA-SE quantos são e de que tipo.
    setASentar(m);
  };

  if (isLoading) return <div className="p-8 text-black/60">A carregar a sala…</div>;

  return (
    <div className="absolute inset-0 overflow-auto">
      <div className="relative" style={{ minWidth: 1200, minHeight: 700 }}>
        {mesas.map((m: any) => {
          const conta = contaDa(m.id);
          const estado = conta ? 'OCCUPIED' : m.status;
          const redonda = m.shape === 'ROUND';
          return (
            <button key={m.id} onClick={() => tocar(m)}
              style={{
                position: 'absolute',
                left: m.pos_x, top: m.pos_y,
                width: m.width, height: m.height,
                background: m.color || '#0f8b8d',
                color: m.text_color || '#fff',
                borderRadius: redonda ? '50%' : 4,
              }}
              className="shadow-md active:scale-95 transition flex items-start justify-start p-2">
              <span
                className="absolute -top-1 -left-1 w-[22px] h-[22px] rounded-full border-2 border-white"
                style={{ background: PONTO[estado] || '#9a9a9a' }} />
              <span className="text-[17px] font-semibold mt-3 ml-1 text-left leading-tight">
                {m.table_number}
                {conta && (
                  <span className="block text-[12px] font-normal opacity-90">
                    {Number(conta.grand_total).toLocaleString('pt-PT')} Kz
                    {/* (8084) estado do pagamento: uma conta parcialmente paga vê-se no mapa */}
                    {mostrarPagamento && Number(conta.balance_due) < Number(conta.grand_total) && (
                      <span className="block text-[11px] font-bold text-[#f0c000]">
                        parcial · falta {Number(conta.balance_due).toLocaleString('pt-PT')}
                      </span>
                    )}
                  </span>
                )}
              </span>
            </button>
          );
        })}

        {/* HÓSPEDE: escolher da lista do PMS e agarrar o nome à conta */}
        {escolherHospede && (
          <GuestPick titulo="Que hóspede está nesta mesa?"
            onPick={async (g) => {
              try {
                await apiClient.post(`pos/tickets/${escolherHospede}/set_customer/`, {
                  customer_name: g.guest, company_name: g.room ? `Quarto ${g.room}` : null,
                });
              } catch { /* sem PMS/nome, a conta segue na mesma */ }
              const id = escolherHospede; setEscolherHospede(null); onOpenTicket(id);
            }}
            onClose={() => { const id = escolherHospede; setEscolherHospede(null); onOpenTicket(id); }} />
        )}

        {aSentar && (
          <GuestsDialog mesa={aSentar} perguntarTipo={perguntarTipo}
            onConfirm={(pax, tipo) => abrir.mutate({ mesa: aSentar, pax, tipo })}
            onPassante={onDirectSale ? () => { setASentar(null); onDirectSale(); } : undefined}
            onCancel={() => setASentar(null)} />
        )}

        {mesas.length === 0 && (
          <div className="p-10 text-black/60">
            Este setor não tem mesas. Configure-as em <b>Configuração POS › Parâmetros › Setores</b>.
          </div>
        )}
      </div>
    </div>
  );
}
