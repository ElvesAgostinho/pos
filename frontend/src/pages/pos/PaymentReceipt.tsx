import { useState } from 'react';
import { apiClient } from '../../api/client';
import { aviso } from '../../ui/dialogo';
import { IcoVisto, IcoCruz, IcoDocumento, IcoLista, IcoImpressora } from './Icons';

/**
 * O RECIBO — o que fica depois de o dinheiro entrar.
 *
 * É o último ecrã da venda, e é o que o cliente vê por cima do ombro: por isso é PAPEL
 * BRANCO, letra de impressora térmica. O empregado vira o terminal e o cliente reconhece
 * o talão que vai receber — não um painel de programa.
 *
 * Mostra as três coisas que se conferem à mão em qualquer balcão do mundo:
 *   quanto era · quanto se deu em cada meio · quanto é o troco
 * e o NÚMERO DO DOCUMENTO, que é o que fica na contabilidade. Sem o número à vista, o
 * empregado não sabe se a fatura chegou a sair — e emite outra por via das dúvidas.
 *
 * REIMPRIMIR não emite nada de novo: manda o MESMO documento outra vez para a fila da
 * impressora. Um documento fiscal não se duplica porque o papel encravou.
 */
export default function PaymentReceipt({ conta, documento, onFechar, onEmitir, onEscolherSerie }: {
  conta: any;
  /** número do documento fiscal já emitido (ex.: "FR A/82"), se houver */
  documento?: string | null;
  onFechar: () => void;
  onEmitir: () => void;
  onEscolherSerie: () => void;
}) {
  const [aImprimir, setAImprimir] = useState(false);

  const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
  const pagamentos: any[] = conta?.payments || [];
  const entregue = pagamentos.reduce((s, p) => s + Number(p.amount || 0), 0);
  const total = Number(conta?.grand_total || 0);
  const falta = Number(conta?.balance_due ?? 0);
  // TROCO: o que se deu a mais. É o número que o cliente confere primeiro.
  const troco = Math.max(0, entregue - total);

  const reimprimir = async () => {
    setAImprimir(true);
    try {
      // REIMPRIMIR usa o motor de REIMPRESSÃO — não o da consulta. Chamava `consult`,
      // que EMITE UM DOCUMENTO NOVO: carregar em "Reimprimir" três vezes deixava três
      // Consultas de Mesa numeradas e assinadas no arquivo fiscal, por causa de papel.
      await apiClient.post(`pos/tickets/${conta.id}/reprint/`, {});
      aviso('Enviado para a impressora.', 'Reimprimir');
    } catch (e: any) {
      aviso(e?.response?.data?.detail || 'Não foi possível reimprimir.');
    } finally { setAImprimir(false); }
  };

  const Linha = ({ k, v, forte }: { k: string; v: string; forte?: boolean }) => (
    <div className={`flex justify-between items-baseline px-5 py-3 border-b border-black/12
      ${forte ? 'text-[26px] font-bold' : 'text-[19px]'}`}>
      <span className={forte ? 'text-black' : 'text-black/70'}>{k}</span>
      <span className="text-black font-semibold">{v}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center pt-8 z-[70]">
      <div className="w-[780px] max-w-[95vw] max-h-[92vh] bg-[#2b2b2b] border-[3px] border-black
        shadow-[0_24px_70px_rgba(0,0,0,0.75)] flex flex-col">

        <div className="h-[64px] bg-gradient-to-b from-[#17a2a4] to-[#0b6b6d] border-b-2 border-black
          flex items-center justify-center flex-shrink-0
          shadow-[inset_0_2px_0_rgba(255,255,255,0.22)]">
          <span className="text-white text-[25px] font-bold">Pagamentos</span>
        </div>

        {/* ─── O PAPEL ─── */}
        <div className="flex-1 overflow-auto bg-white">
          <Linha k="Kz" v={money(total)} forte />
          <Linha k="Troco Kz" v={money(troco)} forte />

          <div className="px-5 pt-4 pb-1 text-[19px] font-bold text-black">Modos de Pagamento</div>
          {pagamentos.length === 0 && (
            <div className="px-5 pb-4 text-[17px] text-black/45">Ainda não entrou nada.</div>
          )}
          {pagamentos.map((p: any) => (
            <div key={p.id} className="flex justify-between px-5 py-2.5 text-[19px] border-b border-black/10">
              <span className="text-black">{p.payment_method_name}</span>
              <span className="text-black font-semibold">{money(p.amount)}</span>
            </div>
          ))}

          {conta?.payment_notes && (
            <div className="px-5 py-3 text-[15px] text-black/70 italic border-b border-black/10">
              {conta.payment_notes}
            </div>
          )}
        </div>

        {/* pago / a pagar */}
        <div className="h-[56px] bg-[#3a3a3a] flex items-center px-5 text-white text-[19px]
          font-semibold flex-shrink-0 border-t-2 border-black">
          <span>Pago: {money(entregue)}</span>
          <span className="ml-auto">A pagar: {money(falta)}</span>
        </div>

        {/* O DOCUMENTO — o número que fica na contabilidade, e o reimprimir */}
        <div className="h-[62px] bg-[#2b2b2b] flex items-center px-5 flex-shrink-0 border-t border-black/60">
          <span className="text-white text-[21px] font-bold">
            {documento || <span className="text-white/40 font-normal text-[17px]">sem documento emitido</span>}
          </span>
          {documento && (
            <button onClick={reimprimir} disabled={aImprimir}
              className="ml-auto flex items-center gap-2 text-white text-[17px] px-3 py-2
                hover:bg-white/10 rounded-[3px] disabled:opacity-40">
              <IcoImpressora size={22} />{aImprimir ? 'A enviar…' : 'Reimprimir'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-1 p-1 bg-black flex-shrink-0">
          <Botao onClick={onFechar} cor="#2ecc40" titulo="Terminar e voltar à sala">
            <IcoVisto size={30} />
          </Botao>
          <Botao onClick={onEmitir} cor="#2ecc40" titulo="Emitir o documento fiscal">
            <span className="flex items-center gap-1"><IcoDocumento size={24} /><IcoVisto size={22} /></span>
          </Botao>
          <Botao onClick={onEscolherSerie} cor="#2ecc40" titulo="Emitir escolhendo a série">
            <span className="flex items-center gap-1"><IcoLista size={24} /><IcoVisto size={22} /></span>
          </Botao>
          <Botao onClick={onFechar} cor="#e02020" titulo="Fechar">
            <IcoCruz size={30} />
          </Botao>
        </div>
      </div>
    </div>
  );
}

const Botao = ({ children, onClick, cor, titulo }: {
  children: any; onClick: () => void; cor: string; titulo: string;
}) => (
  <button onClick={onClick} title={titulo} style={{ color: cor }}
    className="h-[66px] flex items-center justify-center rounded-[3px] border-2 border-black
      bg-gradient-to-b from-[#4a4a4a] to-[#242424]
      shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.55)]
      active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]">
    {children}
  </button>
);
