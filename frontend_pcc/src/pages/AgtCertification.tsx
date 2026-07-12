import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

// Certificação AGT (lado FORNECEDOR): gera o par de chaves RSA + nº de certificado
// por cliente/licença. As credenciais são entregues ao cliente (Fiscal → Certificação AGT).
export default function AgtCertification() {
  const [licenses, setLicenses] = useState<any[]>([]);
  const [licenseId, setLicenseId] = useState('');
  const [cert, setCert] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiClient.get('clm/licenses/').then((r) => setLicenses(r.data?.results || r.data || [])).catch(() => {});
  }, []);

  const generate = async () => {
    if (!cert.trim()) { alert('Indique o nº de certificado atribuído pela AGT.'); return; }
    setBusy(true);
    try {
      const r = await apiClient.post('clm/agt/generate/', { license_id: licenseId || undefined, certificate_number: cert });
      setResult(r.data);
    } catch (e: any) { alert(e?.response?.data?.detail || 'Erro'); }
    finally { setBusy(false); }
  };
  const copy = (t: string) => { navigator.clipboard?.writeText(t); };

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
    </div>
  );
}
