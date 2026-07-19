import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

// Certificação AGT (lado FORNECEDOR): gera o par de chaves RSA + nº de certificado
// por cliente/licença. As credenciais são entregues ao cliente (Fiscal → Certificação AGT).
// A LIGAÇÃO E-FATURA (endpoints + credenciais do contribuinte emitidas pela AGT) também
// se preenche aqui e segue ao cliente na sincronização — o cliente nunca escreve URLs.

const CAMPOS_LIGACAO: [string, string, string][] = [
  // [chave, rótulo, placeholder]
  ['url_auth', 'URL de autenticação', 'https://sifp.minfin.gov.ao/api/auth/token'],
  ['url_submit', 'URL de submissão de documentos', 'https://sifp.minfin.gov.ao/api/invoices/submit'],
  ['url_query', 'URL de consulta de estado', 'https://sifp.minfin.gov.ao/api/invoices/status'],
  ['url_cancel', 'URL de anulação', 'https://sifp.minfin.gov.ao/api/invoices/cancel'],
  ['url_download', 'URL de descarga (2ª via)', 'https://sifp.minfin.gov.ao/api/invoices/download'],
  ['url_saft', 'URL de envio SAF-T', 'https://sifp.minfin.gov.ao/api/saft/submit'],
  ['url_health', 'URL de estado do serviço', 'https://sifp.minfin.gov.ao/api/health'],
];

export default function AgtCertification() {
  const [licenses, setLicenses] = useState<any[]>([]);
  const [licenseId, setLicenseId] = useState('');
  const [cert, setCert] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  // ligação e-fatura
  const [con, setCon] = useState<any>({ environment: 'SANDBOX' });
  const [estado, setEstado] = useState<any>(null); // o que o PCC já tem desta licença
  const [busyCon, setBusyCon] = useState(false);
  const [msgCon, setMsgCon] = useState('');

  useEffect(() => {
    apiClient.get('clm/licenses/').then((r) => setLicenses(r.data?.results || r.data || [])).catch(() => {});
  }, []);

  // ao escolher a licença, carrega o que já está guardado (o secret nunca volta em claro)
  useEffect(() => {
    setMsgCon(''); setEstado(null); setCon({ environment: 'SANDBOX' });
    if (!licenseId) return;
    apiClient.get(`clm/agt/connection/?license_id=${licenseId}`).then((r) => {
      setEstado(r.data);
      setCon({ environment: 'SANDBOX', ...(r.data?.connection || {}) });
    }).catch(() => {});
  }, [licenseId]);

  const generate = async () => {
    if (!cert.trim()) { alert('Indique o nº de certificado atribuído pela AGT.'); return; }
    setBusy(true);
    try {
      const r = await apiClient.post('clm/agt/generate/', { license_id: licenseId || undefined, certificate_number: cert });
      setResult(r.data);
    } catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); }
    finally { setBusy(false); }
  };

  const gravarLigacao = async () => {
    if (!licenseId) { alert('Escolha primeiro a licença do cliente.'); return; }
    setBusyCon(true); setMsgCon('');
    try {
      const r = await apiClient.post('clm/agt/connection/', { license_id: licenseId, ...con });
      setMsgCon(r.data?.detail || 'Guardado.');
      const s = await apiClient.get(`clm/agt/connection/?license_id=${licenseId}`);
      setEstado(s.data);
      setCon((c: any) => ({ ...c, client_secret: '' })); // não fica no ecrã depois de gravar
    } catch (e: any) { alert(e?.response?.data?.detail || 'Erro ao gravar a ligação.'); }
    finally { setBusyCon(false); }
  };

  const copy = (t: string) => { navigator.clipboard?.writeText(t); };
  const inp = 'border border-gray-300 rounded px-2 py-1.5 text-sm flex-1';

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-lg font-bold text-gray-800 mb-1">Certificação AGT (Fornecedor)</h1>
      <p className="text-sm text-gray-500 mb-4">Gere o par de chaves RSA e o nº de certificado por cliente. As credenciais são entregues ao cliente — <b>o cliente nunca gera chaves</b>.</p>

      <div className="bg-white border border-gray-300 rounded p-4 space-y-3 shadow-sm">
        <div className="flex items-center gap-3">
          <label className="w-44 text-sm text-gray-600">Licença do cliente</label>
          <select value={licenseId} onChange={(e) => setLicenseId(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm flex-1">
            <option value="">— (só gerar, sem guardar) —</option>
            {licenses.map((l: any) => <option key={l.id} value={l.id}>{l.license_number} · {l.client?.commercial_name || l.plan}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <label className="w-44 text-sm text-gray-600">Nº certificado AGT</label>
          <input value={cert} onChange={(e) => setCert(e.target.value)} placeholder="Ex.: 147/AGT/2026" className="border border-gray-300 rounded px-2 py-1.5 text-sm w-64" />
        </div>
        <button onClick={generate} disabled={busy} className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded disabled:opacity-50">
          {busy ? 'A gerar…' : 'Gerar credenciais AGT'}
        </button>
      </div>

      {result && (
        <div className="bg-white border border-green-300 rounded p-4 mt-4 space-y-3 shadow-sm">
          <div className="text-green-800 font-bold text-sm">✓ Credenciais geradas — entregue ao cliente</div>
          <div className="text-sm"><b>Nº certificado:</b> {result.certificate_number} {result.license && <span className="text-gray-500">· guardado na licença {result.license}</span>}</div>
          {[['Chave privada (PEM)', result.private_key], ['Chave pública (PEM)', result.public_key]].map(([label, val]: any) => (
            <div key={label}>
              <div className="flex items-center justify-between mb-1"><span className="text-xs font-bold text-gray-600">{label}</span>
                <button onClick={() => copy(val)} className="text-xs text-blue-700 hover:underline">copiar</button></div>
              <textarea readOnly value={val} rows={label.includes('privada') ? 5 : 3} className="w-full border border-gray-300 rounded p-2 font-mono text-[10px] bg-gray-50" />
            </div>
          ))}
          <div className="text-xs text-gray-500">No cliente: <b>Fiscal → Certificação AGT</b> → colar estas credenciais → aplicar. A partir daí, o nº de certificado sai automaticamente em todas as faturas, no QR e no SAF-T.</div>
        </div>
      )}

      {/* ── LIGAÇÃO E-FATURA — credenciais do contribuinte emitidas pela AGT ── */}
      <div className="bg-white border border-gray-300 rounded p-4 mt-6 space-y-3 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-gray-800">Ligação e-fatura (credenciais do contribuinte)</h2>
          <p className="text-sm text-gray-500">Quando a AGT emitir as credenciais do contribuinte, preenchem-se aqui. Seguem ao cliente na próxima <b>sincronização</b> e o motor fiscal sai do modo simulação sozinho — o cliente nunca digita URLs.</p>
        </div>

        {!licenseId && <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">Escolha a licença do cliente no topo da página para configurar a ligação.</div>}

        {licenseId && (
          <>
            {estado && (
              <div className={`text-xs rounded px-3 py-2 border ${estado.configured ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                {estado.configured ? '✓ Esta licença já tem ligação configurada — gravar substitui.' : 'Sem ligação configurada nesta licença.'}
                {' '}Certificado: <b>{estado.certificate_number || '—'}</b> · Chaves de assinatura: <b>{estado.has_keys ? 'geradas' : 'por gerar'}</b>
              </div>
            )}

            <div className="flex items-center gap-3">
              <label className="w-56 text-sm text-gray-600">Ambiente</label>
              <select value={con.environment || 'SANDBOX'} onChange={(e) => setCon({ ...con, environment: e.target.value })} className="border border-gray-300 rounded px-2 py-1.5 text-sm w-64">
                <option value="SANDBOX">SANDBOX (testes da AGT)</option>
                <option value="PRODUCTION">PRODUCTION (real)</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="w-56 text-sm text-gray-600">Client ID (contribuinte)</label>
              <input value={con.client_id || ''} onChange={(e) => setCon({ ...con, client_id: e.target.value })} placeholder="atribuído pela AGT" className={inp} />
            </div>
            <div className="flex items-center gap-3">
              <label className="w-56 text-sm text-gray-600">Client Secret</label>
              <input type="password" value={con.client_secret || ''} onChange={(e) => setCon({ ...con, client_secret: e.target.value })}
                placeholder={estado?.has_secret ? '••• já guardado — deixar vazio mantém' : 'atribuído pela AGT'} className={inp} />
            </div>
            {CAMPOS_LIGACAO.map(([k, label, ph]) => (
              <div key={k} className="flex items-center gap-3">
                <label className="w-56 text-sm text-gray-600">{label}</label>
                <input value={con[k] || ''} onChange={(e) => setCon({ ...con, [k]: e.target.value })} placeholder={ph} className={`${inp} font-mono text-[12px]`} />
              </div>
            ))}

            <div className="flex items-center gap-3 pt-1">
              <button onClick={gravarLigacao} disabled={busyCon} className="bg-blue-700 hover:bg-blue-800 text-white text-sm px-4 py-2 rounded disabled:opacity-50">
                {busyCon ? 'A gravar…' : 'Gravar ligação e-fatura'}
              </button>
              {msgCon && <span className="text-sm text-green-700">{msgCon}</span>}
            </div>
            <div className="text-xs text-gray-500">O secret guarda-se no PCC e, no cliente, fica <b>encriptado</b> no motor fiscal. No cliente aplica-se ao clicar <b>Sincronizar com o PCC</b> no Gestor de licenças.</div>
          </>
        )}
      </div>
    </div>
  );
}
