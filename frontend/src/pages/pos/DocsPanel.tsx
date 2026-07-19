import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';
import { aviso, pedir } from '../../ui/dialogo';
import { IcoCruz, IcoDocumento, IcoImpressora, IcoLupa, IcoVoltar } from './Icons';

/**
 * DOCUMENTOS — o que já foi faturado neste terminal.
 *
 * É o ecrã a que se corre quando o cliente volta com o papel na mão: reimprimir a via,
 * anular (com nota de crédito), devolver um artigo. Nada aqui apaga nada: um documento
 * fiscal não se apaga, anula-se — e a nota de crédito também é assinada e encadeada.
 * É o que a AGT exige, e o que impede que uma venda desapareça sem rasto.
 */
const hoje = () => new Date().toISOString().slice(0, 10);

export default function DocsPanel({ onClose }: { onClose: () => void }) {
  const [de, setDe] = useState(hoje());
  const [ate, setAte] = useState(hoje());
  const [numero, setNumero] = useState('');
  const [busca, setBusca] = useState<any>({ from: hoje(), to: hoje() });
  const [sel, setSel] = useState<any | null>(null);
  const [ver, setVer] = useState<any | null>(null);

  const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });

  const { data } = useQuery({
    queryKey: ['pos-docs', busca],
    queryFn: async () => (await apiClient.get('pos/reports/documents/', { params: busca })).data,
  });

  const acao = async (accao: string) => {
    if (!sel) return aviso('Escolha um documento.');
    try {
      if (accao === 'preview') {
        const r = await apiClient.get(`pos/reports/documents/${sel.id}/`);
        return setVer(r.data);
      }
      if (accao === 'print') {
        const r = await apiClient.post(`pos/reports/documents/${sel.id}/`, { action: 'print' });
        return aviso(r.data.detail);
      }
      if (accao === 'void') {
        const motivo = await pedir(
          'ANULAR o documento emite uma NOTA DE CRÉDITO (assinada e encadeada).\n\nMotivo:');
        if (!motivo) return;
        const r = await apiClient.post(`pos/reports/documents/${sel.id}/`,
          { action: 'void', reason: motivo });
        setSel(null);
        return aviso(r.data.detail);
      }
    } catch (e: any) {
      aviso(e?.response?.data?.detail || 'Não foi possível executar a ação.');
    }
  };

  const BTN = ({ icon, label, on, cor }: any) => (
    <button onClick={on}
      className="w-full h-[62px] bg-[#1f1f1f] border-b border-black text-white
        flex flex-col items-center justify-center gap-1 hover:bg-[#2f2f2f]">
      <span className="text-[20px]" style={{ color: cor }}>{icon}</span>
      <span className="text-[12px] text-center leading-tight px-2">{label}</span>
    </button>
  );

  // pré-visualização do documento
  if (ver) {
    return (
      <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-40">
        <div className="w-[640px] bg-white p-8 max-h-[92%] overflow-auto pos-arrasta">
          <div className="flex justify-between">
            <div>
              <div className="text-[17px] font-bold">{ver.company}</div>
              <div className="text-[12px] text-[#666]">NIF: {ver.company_tax_id}</div>
            </div>
            <div className="text-right">
              <div className="font-bold">{ver.type}</div>
              <div className="font-mono">{ver.invoice_no}</div>
              <div className="text-[12px] text-[#666]">{ver.date}</div>
              {ver.print_count > 0 && (
                <div className="text-[11px] text-[#a01818] font-bold">2ª VIA</div>
              )}
            </div>
          </div>
          <div className="mt-4 text-[12px] border-y border-[#eee] py-2">
            <div><b>Cliente:</b> {ver.customer}</div>
            <div><b>NIF:</b> {ver.customer_tax_id || 'Consumidor Final'}</div>
          </div>
          <table className="w-full text-[12px] mt-3">
            <tbody>
              {ver.lines.map((l: any, i: number) => (
                <tr key={i} className="border-b border-[#f0f0f0]">
                  <td className="py-1">{Number(l.quantity)}x {l.description}</td>
                  <td className="text-right">{money(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-right mt-3">
            <div className="text-[12px]">Incidência: {money(ver.net)} · IVA: {money(ver.tax)}</div>
            <div className="text-[19px] font-bold">TOTAL: {money(ver.gross)} Kz</div>
          </div>
          <div className="text-[12px] italic mt-2">Valor por extenso: {ver.amount_in_words}</div>
          <div className="text-[10px] text-[#888] mt-4">
            Processado por programa validado n.º {ver.certificate}
          </div>
          <button onClick={() => setVer(null)}
            className="mt-6 w-full h-[50px] bg-[#2b2b2b] text-white font-bold">Fechar</button>
        </div>
      </div>
    );
  }

  return (
    <Window title="Documentos" width={1320} onClose={onClose}>
      <div className="flex flex-col" style={{ height: '62vh' }}>
        <div className="flex-1 flex overflow-hidden">
          {/* ações à esquerda */}
          <div className="w-[190px] bg-black flex flex-col">
            <BTN icon={<IcoImpressora size={22} />} label="Reimprimir" on={() => acao('print')} />
            {/* A LISTAGEM é esta grelha — mostra-se TUDO aqui, sem mandar o caixa
                para o backoffice (o terminal é autossuficiente). */}
            <BTN icon={<IcoImpressora size={22} />} label="Listagem Documentos"
              on={() => { setDe(''); setAte(''); setNumero(''); setBusca({}); }} />
            <BTN icon={<IcoLupa size={22} />} label="Pré-visualizar" on={() => acao('preview')} cor="#4ec5c1" />
            <BTN icon={<IcoDocumento size={22} />} label="Anular" on={() => acao('void')} cor="#e02020" />
            <BTN icon={<IcoVoltar size={20} />} label="Processar devolução" on={() => acao('void')} cor="#e02020" />
            <BTN icon="≣" label="Anulação parcial" on={() => acao('void')} cor="#e02020" />
            <button onClick={onClose}
              className="w-full h-[62px] bg-[#c0140f] text-white flex flex-col items-center justify-center gap-1 mt-auto font-bold">
              <span className="text-[28px]"><IcoCruz size={24} /></span> Fechar
            </button>
          </div>

          <div className="flex-1 flex flex-col">
            {/* filtros */}
            <div className="flex items-center gap-3 p-3 bg-[#2b2b2b]">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-white w-[40px]">De</span>
                  <input type="date" value={de} onChange={(e) => setDe(e.target.value)}
                    className="h-[40px] bg-[#3a3a3a] text-white px-2 text-[14px] rounded" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white w-[40px]">Até</span>
                  <input type="date" value={ate} onChange={(e) => setAte(e.target.value)}
                    className="h-[40px] bg-[#3a3a3a] text-white px-2 text-[14px] rounded" />
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-white w-[110px]">Documento</span>
                  <input value={numero} onChange={(e) => setNumero(e.target.value)}
                    className="flex-1 h-[40px] bg-[#8a8a8a] text-white px-3 text-[14px] rounded" />
                </div>
              </div>
              <button onClick={() => setBusca({ from: de, to: ate, number: numero || undefined })}
                className="w-[90px] h-[88px] bg-[#1f7a34] text-white text-[26px] rounded"><IcoLupa size={22} /></button>
            </div>

            {/* lista */}
            <div className="grid grid-cols-[1fr_170px_170px_110px_150px] bg-[#3a3a3a] text-white
              text-[13px] font-bold px-3 py-2">
              <span>Numero</span><span className="text-right">Total</span>
              <span>Utilizador</span><span>Mesa</span><span>Data</span>
            </div>
            <div className="flex-1 overflow-auto pos-arrasta bg-[#1f1f1f]">
              {(data?.rows || []).map((d: any) => (
                <button key={d.id} onClick={() => setSel(d)}
                  className={`w-full grid grid-cols-[1fr_170px_170px_110px_150px] px-3 py-2.5 text-left
                    text-white text-[14px] border-b border-black/40
                    ${sel?.id === d.id ? 'bg-[#0f8b8d]' : 'hover:bg-[#2b2b2b]'}`}>
                  <span className="font-mono">
                    {d.number}
                    {d.voided && <span className="ml-2 text-[#ff8a80] text-[12px]">ANULADO</span>}
                  </span>
                  <span className="text-right">{money(d.total)}</span>
                  <span>{d.operator || '—'}</span>
                  <span>{d.place || '—'}</span>
                  <span>{d.date}</span>
                </button>
              ))}
              {(data?.rows || []).length === 0 && (
                <div className="text-white/50 text-center py-12">Sem documentos no período.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Window>
  );
}
