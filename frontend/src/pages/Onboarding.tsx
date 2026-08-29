import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, RefreshCcw, FolderOpen, AlertTriangle, CheckCircle2, Wifi, Upload } from 'lucide-react';
import { apiClient } from '../api/client';
import { useLicenseStatus } from '../hooks/useActiveModules';

interface Preflight {
  checked_path: string; exists: boolean; size_bytes?: number; modified_at?: string;
  client_code?: string; license_number?: string; valid_until?: string;
  diagnosis: string; detail: string;
}

const DIAGNOSIS_LABEL: Record<string, string> = {
  FICHEIRO_AUSENTE: 'Ficheiro não encontrado',
  FICHEIRO_ILEGIVEL: 'Ficheiro ilegível',
  CONTEUDO_CORROMPIDO: 'Ficheiro corrompido',
  SEM_ASSINATURA: 'Sem assinatura',
  ERRO_VERIFICACAO: 'Erro a verificar',
  ASSINATURA_INVALIDA: 'Assinatura inválida',
  EXPIRADA: 'Licença expirada',
  OK: 'Ficheiro válido',
};

// Diagnóstico da PRÓPRIA falha, sem precisar de login (não há login possível sem
// licença) nem de copiar scripts para a máquina — só abrir este ecrã já diz a
// causa exata. Pedido limpo, fora do apiClient (mesma razão do useLicenseStatus:
// não colar um token velho a um pedido que tem de funcionar sem sessão nenhuma).
const usePreflight = () =>
  useQuery({
    queryKey: ['licensing', 'preflight'],
    queryFn: async (): Promise<Preflight> => {
      const base = (apiClient.defaults.baseURL || '/api/').replace(/\/?$/, '/');
      const r = await fetch(`${base}licensing/preflight/`);
      if (!r.ok) throw new Error(`preflight: ${r.status}`);
      return r.json();
    },
    staleTime: 10 * 1000,
    retry: false,
  });

/**
 * Ecrã de primeiro arranque, quando ainda não há license.key nesta instalação.
 *
 * Tem TRÊS formas de ativar — nenhuma delas obriga o dono a abrir a pasta do
 * servidor (isso é o que se quer evitar: um cliente sem jeito para informática
 * lá a mexer na pasta da instalação estraga mais do que resolve):
 *   1. Carregar o ficheiro — o técnico já entregou o license.key por email/
 *      WhatsApp/pen; o dono escolhe-o no seletor de ficheiros do SEU PRÓPRIO
 *      computador (nunca no do servidor) e o browser envia o conteúdo.
 *   2. Ativação automática — só um código + uma senha (os mesmos do setup.exe),
 *      o servidor vai buscar a licença ao PCC sozinho, sem ficheiro nenhum.
 *   3. Manual — para quando nenhuma das duas anteriores é possível (sem
 *      Internet nem acesso ao browser do dono): aí sim, alguém com acesso ao
 *      servidor copia o ficheiro à mão.
 * Um ecrã anterior aqui pedia "Terminal ID + Activation Key" e chamava
 * clm/terminals/activate/ — isso era o licenciamento de TERMINAIS POS dentro de
 * uma casa já licenciada (clm.TerminalLicense), não tinha nada a ver com a
 * licença do servidor. Gravava um token que ninguém lia (RequireLicense só
 * confia em licensing/status/) e deixava o dono preso aqui em loop infinito
 * depois de "ativar" — aconteceu numa instalação real. As três formas de agora
 * não repetem esse erro: todas escrevem o MESMO ficheiro license.key que o
 * caminho manual sempre escreveu, assinado pelo fornecedor — é a fonte que
 * licensing/status/ já lê, por isso este ecrã sai sozinho assim que funciona.
 */
const Onboarding: React.FC = () => {
  const { isLoading, refetch } = useLicenseStatus();
  const { data: pre, refetch: refetchPre } = usePreflight();

  // 1) CARREGAR O FICHEIRO — o dono escolhe no computador DELE (nunca no
  // servidor) o license.key que o técnico já lhe entregou; o browser envia.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ficheiro, setFicheiro] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviarMsg, setEnviarMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleEnviarFicheiro = async () => {
    if (!ficheiro) return;
    setEnviarMsg(null);
    setEnviando(true);
    try {
      const base = (apiClient.defaults.baseURL || '/api/').replace(/\/?$/, '/');
      const formData = new FormData();
      formData.append('file', ficheiro);
      const r = await fetch(`${base}licensing/upload/`, { method: 'POST', body: formData });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { setEnviarMsg({ ok: false, text: body.detail || `Falhou (HTTP ${r.status}).` }); return; }
      setEnviarMsg({ ok: true, text: body.detail || 'Licença carregada.' });
      setFicheiro(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      refetch(); refetchPre();
    } catch {
      setEnviarMsg({ ok: false, text: 'Sem ligação ao servidor.' });
    } finally {
      setEnviando(false);
    }
  };

  // 2) ATIVAÇÃO AUTOMÁTICA — o técnico já tem estes dois valores para correr o
  // setup.exe (PCC → Gestão de Clientes → Acessos); reaproveitados aqui para
  // puxar a licença pela Internet, sem ficheiro nenhum.
  const [clientCode, setClientCode] = useState('');
  const [installPassword, setInstallPassword] = useState('');
  const [ativando, setAtivando] = useState(false);
  const [ativarMsg, setAtivarMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleAtivar = async (e: React.FormEvent) => {
    e.preventDefault();
    setAtivarMsg(null);
    setAtivando(true);
    try {
      const base = (apiClient.defaults.baseURL || '/api/').replace(/\/?$/, '/');
      const r = await fetch(`${base}licensing/activate-remote/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_code: clientCode.trim(), install_password: installPassword }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { setAtivarMsg({ ok: false, text: body.detail || `Falhou (HTTP ${r.status}).` }); return; }
      setAtivarMsg({ ok: true, text: body.detail || 'Licença ativada.' });
      refetch(); refetchPre();
    } catch (err: any) {
      setAtivarMsg({ ok: false, text: 'Sem ligação ao servidor.' });
    } finally {
      setAtivando(false);
    }
  };

  // Verifica sozinho a cada 10s — o técnico não precisa de clicar nada depois de
  // copiar o license.key; assim que o servidor o vê, este ecrã sai sozinho.
  useEffect(() => {
    const t = setInterval(() => { refetch(); refetchPre(); }, 10000);
    return () => clearInterval(t);
  }, [refetch, refetchPre]);

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
            instalação. Ative-a de uma das formas abaixo.
          </p>

          <div className="bg-green-50 border border-green-200 rounded p-4 text-sm space-y-3">
            <div className="flex items-start gap-2">
              <Upload size={16} className="text-green-600 mt-0.5 shrink-0" />
              <div className="font-bold text-green-900">Carregar o ficheiro (recomendado)</div>
            </div>
            <p className="text-[12px] text-gray-600">
              O técnico já lhe entregou o <code className="bg-gray-200 px-1 rounded">license.key</code> (email,
              WhatsApp, pen). Escolha-o aqui, no SEU computador — nunca precisa de abrir a pasta
              do servidor.
            </p>
            <input ref={fileInputRef} type="file" accept=".key,text/plain"
              onChange={(e) => setFicheiro(e.target.files?.[0] || null)}
              className="w-full text-[12px] text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-green-600 file:text-white file:font-bold hover:file:bg-green-700 file:cursor-pointer" />
            {enviarMsg && (
              <div className={`text-[12px] px-2 py-1 rounded border ${enviarMsg.ok ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
                {enviarMsg.text}
              </div>
            )}
            <button onClick={handleEnviarFicheiro} disabled={enviando || !ficheiro}
              className="w-full flex items-center justify-center gap-2 py-2 bg-green-600 text-white rounded font-bold hover:bg-green-700 disabled:opacity-50">
              {enviando ? 'A enviar…' : 'Submeter'}
            </button>
          </div>

          <form onSubmit={handleAtivar} className="bg-blue-50 border border-blue-200 rounded p-4 text-sm space-y-3">
            <div className="flex items-start gap-2">
              <Wifi size={16} className="text-blue-500 mt-0.5 shrink-0" />
              <div className="font-bold text-blue-900">Ativação automática (só código + senha, sem ficheiro)</div>
            </div>
            <p className="text-[12px] text-gray-600">
              Os mesmos dois dados que já tem para correr o setup.exe (PCC → Gestão de Clientes
              → Acessos) — sem copiar nenhum ficheiro à mão.
            </p>
            <label className="block">
              <span className="text-gray-700 block mb-1 text-[13px]">Código do cliente (ex.: CLI-1234):</span>
              <input autoFocus value={clientCode} onChange={(e) => setClientCode(e.target.value)}
                className="w-full h-9 px-2 bg-white border border-gray-300 rounded outline-none font-mono" />
            </label>
            <label className="block">
              <span className="text-gray-700 block mb-1 text-[13px]">Senha de instalação:</span>
              <input type="password" value={installPassword} onChange={(e) => setInstallPassword(e.target.value)}
                className="w-full h-9 px-2 bg-white border border-gray-300 rounded outline-none" />
            </label>
            {ativarMsg && (
              <div className={`text-[12px] px-2 py-1 rounded border ${ativarMsg.ok ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
                {ativarMsg.text}
              </div>
            )}
            <button type="submit" disabled={ativando || !clientCode || !installPassword}
              className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 disabled:opacity-50">
              {ativando ? 'A ativar…' : 'Ativar via Internet'}
            </button>
          </form>

          <div className="bg-gray-50 border border-gray-200 rounded p-4 text-sm text-gray-700 space-y-2">
            <div className="flex items-start gap-2">
              <FolderOpen size={16} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <div className="font-bold">Manual (só se nenhuma das anteriores for possível):</div>
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

          {pre && (
            <div className={`border rounded p-4 text-sm space-y-2 ${
              pre.diagnosis === 'OK' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-start gap-2">
                {pre.diagnosis === 'OK'
                  ? <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
                  : <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />}
                <div className="flex-1">
                  <div className={`font-bold ${pre.diagnosis === 'OK' ? 'text-green-800' : 'text-red-800'}`}>
                    Diagnóstico: {DIAGNOSIS_LABEL[pre.diagnosis] || pre.diagnosis}
                  </div>
                  <p className="text-gray-700 mt-1">{pre.detail}</p>
                  <div className="mt-2 text-[11px] text-gray-500 font-mono bg-white/60 border border-gray-200 rounded p-2 space-y-0.5">
                    <div>caminho: {pre.checked_path}</div>
                    <div>existe: {String(pre.exists)}
                      {pre.size_bytes != null && ` · ${pre.size_bytes} bytes`}
                      {pre.modified_at && ` · modificado ${pre.modified_at}`}</div>
                    {pre.client_code && <div>cliente: {pre.client_code} · licença: {pre.license_number} · válida até: {pre.valid_until}</div>}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">
                    Copie este quadro e envie ao suporte — não é preciso correr nenhum script.
                  </p>
                </div>
              </div>
            </div>
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
