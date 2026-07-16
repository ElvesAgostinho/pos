import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import Window from './Window';

/**
 * CONSULTA DE MESA — o talão de conferência, SEM ir à página de venda.
 *
 * Não se inventa nada aqui: o terminal pede ao servidor a CONSULTA DE MESA (documento
 * CM da AGT — o Rules Engine fiscal já o tinha), e o servidor devolve O MESMO texto
 * que pôs na fila da impressora térmica. O ecrã mostra o papel: fundo branco, letra
 * de impressora. O que o cliente vê aqui é exatamente o que recebe na mesa.
 */
export default function TicketPreview({ ticket, onClose }: {
  ticket: any; onClose: () => void;
}) {
  const [talao, setTalao] = useState<string | null>(null);
  const [numero, setNumero] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await apiClient.post(`pos/tickets/${ticket.id}/consult/`, {});
        setTalao(r.data?.content || '');
        setNumero(r.data?.invoice_no || '');
      } catch (e: any) {
        setErro(e?.response?.data?.detail || 'Não foi possível emitir a consulta.');
      }
    })();
  }, [ticket.id]);

  const onde = ticket.dest_label || (ticket.table_label ? `Mesa ${ticket.table_label}` : 'Balcão');

  return (
    <Window title={`Consulta de Mesa — ${onde}${numero ? ` · ${numero}` : ''}`}
      width={380} onClose={onClose} tone="#0f8b8d">
      <div className="bg-[#d8d8d8] p-3">
        {/* o talão térmico: o texto vem do servidor, tal e qual vai para a impressora */}
        <div className="bg-white text-black shadow-[0_2px_10px_rgba(0,0,0,.35)]
          max-h-[62vh] overflow-auto px-4 py-3">
          {erro && <div className="text-[#c0140f] font-semibold text-[14px] py-4 text-center">{erro}</div>}
          {talao === null && !erro && (
            <div className="text-black/50 text-[14px] py-6 text-center">A emitir a consulta…</div>
          )}
          {talao !== null && !erro && (
            <pre className="font-mono text-[13px] leading-[1.4] whitespace-pre-wrap">{talao}</pre>
          )}
        </div>

        <button onClick={onClose}
          className="w-full h-[48px] mt-2 bg-[#3a3a3a] text-white text-[16px] font-bold rounded">
          Fechar
        </button>
      </div>
    </Window>
  );
}
