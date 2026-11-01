import { Suspense, type ReactNode } from 'react';

/**
 * A ESPERA ENQUANTO UM ECRÃ CHEGA.
 *
 * ─── PORQUE É QUE OS ECRÃS PASSARAM A CHEGAR TARDE ────────────────────────
 * Até agora o sistema vinha todo num ficheiro só: 2750 módulos, 2,6 MB de
 * JavaScript. Abrir o login descarregava o PMS, o POS, a contabilidade, o
 * fiscal e os 160 ecrãs do backoffice — tudo, antes de alguém escrever o
 * nome de utilizador. Num computador de recepção com ligação fraca isso são
 * segundos de ecrã branco em CADA entrada, todos os dias.
 *
 * Agora cada ecrã é um ficheiro próprio, pedido quando se abre. A entrada
 * fica rápida; o custo é que, da primeira vez que se abre um ecrã, há uma
 * fracção de segundo à espera dele. É isso que esta caixa cobre.
 *
 * ─── PORQUE É QUE NÃO É UMA RODA A GIRAR ──────────────────────────────────
 * Uma roda a girar no meio de um ecrã vazio diz "espera" e mais nada — e se
 * a ligação cair, fica a girar para sempre, a prometer uma coisa que não vai
 * acontecer. Isto diz o que está a acontecer, por palavras, e a barra tem
 * princípio e fim.
 *
 * ─── E PORQUE É QUE NÃO APARECE QUASE NUNCA ───────────────────────────────
 * Numa rede local o ficheiro chega em poucos milissegundos e isto passa sem
 * se ver. É de propósito: aparecer só quando a espera é real. Um indicador
 * que pisca a cada clique ensina a ignorar os indicadores.
 */
export function EcraAdiado({ children }: { children: ReactNode }) {
  return <Suspense fallback={<AEsperaDoEcra />}>{children}</Suspense>;
}

function AEsperaDoEcra() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-3"
      style={{ background: '#FFFFFF' }}>
      <div className="w-[160px] h-[3px] overflow-hidden" style={{ background: '#E4E8ED' }}>
        <div style={{
          width: '45%', height: '100%', background: '#2563EB',
          animation: 'ecra-adiado 1.1s ease-in-out infinite',
        }} />
      </div>
      <div className="text-[11.5px]" style={{ color: '#6B7280' }}>a abrir o ecrã…</div>
      {/* A animação declarada aqui e não na folha global: é desta caixa e de
          mais nada, e uma regra global a mais é uma regra que ninguém sabe
          de onde veio quando precisar de a apagar. */}
      <style>{`@keyframes ecra-adiado {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(355%); }
      }`}</style>
    </div>
  );
}

export default EcraAdiado;
