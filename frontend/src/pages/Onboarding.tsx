import React, { useEffect } from 'react';
import { ShieldCheck, RefreshCcw, FolderOpen } from 'lucide-react';
import { useLicenseStatus } from '../hooks/useActiveModules';

/**
 * Ecrã de primeiro arranque, quando ainda não há license.key nesta instalação.
 *
 * NÃO é um formulário de ativação — a ativação da licença do SERVIDOR ainda é manual
 * (o técnico copia o license.key gerado no PCC para {app}\app\license.key e reinicia o
 * serviço "Mwana Lodge — Servidor"; ver instalador/LEIA-ME.md). Um ecrã anterior aqui
 * pedia "Terminal ID + Activation Key" e chamava clm/terminals/activate/ — isso é o
 * licenciamento de TERMINAIS POS dentro de uma casa já licenciada (clm.TerminalLicense),
 * não tem nada a ver com a licença do servidor em si. Gravava um token que ninguém lia
 * (RequireLicense só confia em licensing/status/) e deixava o dono preso aqui em loop
 * infinito depois de "ativar" — foi exatamente o que aconteceu numa instalação real.
 * Este ecrã espera, de forma honesta, pela licença verdadeira.
 */
const Onboarding: React.FC = () => {
  const { data, isLoading, refetch } = useLicenseStatus();

  // Verifica sozinho a cada 10s — o técnico não precisa de clicar nada depois de
  // copiar o license.key; assim que o servidor o vê, este ecrã sai sozinho.
  useEffect(() => {
    const t = setInterval(() => refetch(), 10000);
    return () => clearInterval(t);
  }, [refetch]);

  return (
    <div className="min-h-screen bg-[#111827] flex items-center justify-center p-4">
      <div className="bg-white max-w-lg w-full rounded shadow-2xl overflow-hidden">
        <div className="bg-[#1f2937] text-white p-6 flex items-center gap-3">
          <ShieldCheck size={28} className="text-[#90c040]" />
          <div>
            <h1 className="text-lg font-bold">System Mwana Lodge</h1>
            <p className="text-xs text-gray-400">Ainda sem licença ativa nesta instalação</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-700">
            Este servidor está a correr, mas ainda não tem o ficheiro de licença desta
            instalação. É o técnico que a coloca — não é um passo que se faça por aqui.
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded p-4 text-sm text-gray-700 space-y-2">
            <div className="flex items-start gap-2">
              <FolderOpen size={16} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <div className="font-bold">Para o técnico:</div>
                <ol className="list-decimal list-inside mt-1 space-y-1 text-gray-600">
                  <li>Vá ao PCC → Gestão de Clientes → selecione este cliente.</li>
                  <li>Copie o ficheiro <code className="bg-gray-200 px-1 rounded">license.key</code> gerado para
                    ele.</li>
                  <li>Coloque-o em <code className="bg-gray-200 px-1 rounded">{'{pasta da instalação}'}\app\license.key</code>.</li>
                  <li>Esta página deteta sozinha em poucos segundos — não precisa de reiniciar nada.</li>
                </ol>
              </div>
            </div>
          </div>

          {data && !data.licensed && (
            <div className="text-xs text-gray-400">Última verificação: sem licença encontrada.</div>
          )}

          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#111827] text-white rounded font-bold hover:bg-[#1f2937] transition-colors disabled:opacity-50"
          >
            <RefreshCcw size={16} className={isLoading ? 'animate-spin' : ''} />
            {isLoading ? 'A verificar…' : 'Verificar agora'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
