import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import TouchKeyboard from './TouchKeyboard';

/**
 * MOTIVO DE ANULAÇÃO — a pergunta que se faz antes de apagar uma venda.
 *
 * Não é burocracia: é o que separa "o cliente desistiu" de "o empregado levou o dinheiro".
 * Uma anulação sem motivo é um buraco na contabilidade que ninguém consegue explicar
 * três meses depois — e é por aí que a caixa foge.
 *
 * A LISTA É DO BACKOFFICE (Configuração POS › Motivos de Anulação). Escrita à mão, cada
 * empregado inventava a sua ("engano", "erro", "asneira") e no fim do mês não havia como
 * contar quantas anulações foram por reclamação da cozinha.
 *
 * TEXTO LIVRE fica em primeiro, como no original: o caso que a lista não previu tem de
 * ter saída — senão o empregado escolhe o motivo errado só para poder seguir.
 */
export default function VoidReasonDialog({ titulo = 'Motivo de Anulação', onPick, onClose }: {
  titulo?: string;
  onPick: (motivo: string) => void;
  onClose: () => void;
}) {
  const [livre, setLivre] = useState<string | null>(null);

  const { data: motivos = [], isLoading } = useQuery({
    queryKey: ['pos-void-reasons'],
    queryFn: async () => {
      const r = await apiClient.get('pos/config/void-reasons/');
      return ((r.data?.results || r.data || []) as any[])
        .filter((m) => m.is_active !== false)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center pt-16 z-50"
      onClick={onClose}>
      <div className="w-[600px] bg-[#1f1f1f] shadow-2xl border border-black"
        onClick={(e) => e.stopPropagation()}>
        <div className="h-[64px] bg-[#c0140f] flex items-center justify-center">
          <span className="text-white text-[26px] font-bold">{titulo}</span>
        </div>

        {livre === null ? (
          <div className="max-h-[70vh] overflow-auto">
            <button onClick={() => setLivre('')}
              className="w-full h-[62px] px-6 text-left text-white text-[19px]
                bg-[#2b2b2b] hover:bg-[#3a3a3a] border-b border-black">
              Texto Livre
            </button>
            {isLoading && <div className="p-6 text-white/60">A ler os motivos…</div>}
            {!isLoading && motivos.length === 0 && (
              <div className="p-6 text-white/60 text-[15px]">
                Sem motivos configurados. Crie-os em <b>Configuração POS › Motivos de Anulação</b>
                {' '}— ou use Texto Livre.
              </div>
            )}
            {motivos.map((m: any) => (
              // O que segue para o registo é o texto de IMPRESSÃO (o que sai no talão e
              // fica na auditoria), não o rótulo da tecla.
              <button key={m.id} onClick={() => onPick(m.print_label || m.key_label)}
                className="w-full h-[62px] px-6 text-left text-white text-[19px]
                  bg-[#2b2b2b] hover:bg-[#3a3a3a] border-b border-black">
                {m.key_label}
              </button>
            ))}
          </div>
        ) : (
          <div className="p-3">
            <div className="h-[56px] bg-black rounded text-white text-[20px] px-4 flex items-center
              border border-[#4a4a4a] mb-2">
              {livre || <span className="text-white/25">Escreva o motivo…</span>}
            </div>
            <TouchKeyboard valor={livre} setValor={setLivre}
              onOk={() => livre.trim() && onPick(livre.trim())} />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button onClick={() => livre.trim() && onPick(livre.trim())} disabled={!livre.trim()}
                className="h-[62px] bg-[#1f7a34] text-white text-[20px] font-bold rounded
                  disabled:bg-[#3a3a3a] disabled:text-white/30">Confirmar</button>
              <button onClick={() => setLivre(null)}
                className="h-[62px] bg-[#3a3a3a] text-white text-[20px] rounded">Voltar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
