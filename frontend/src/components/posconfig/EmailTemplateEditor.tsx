import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';

function Row({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex items-center gap-3 text-[12px]">
      <span className="w-[120px] flex-shrink-0 text-[#333]">{label}</span>
      {children}
    </label>
  );
}

/**
 * MODELO DE E-MAIL — a mensagem que o hotel envia sozinho.
 *
 * Cada modelo tem uma FONTE DE DADOS (de onde saem as variáveis) e um texto POR
 * LÍNGUA — o hóspede alemão recebe em alemão. As línguas em falta aparecem a
 * vermelho na grelha: sem esse aviso, o francês recebia o e-mail em inglês e só
 * se descobria quando ele reclamasse.
 *
 * Um SUB-MODELO não se envia sozinho: é um pedaço (a assinatura, a lista de
 * extras) que os outros incluem. Sem isso, a assinatura do hotel estava copiada em
 * quinze modelos e mudar o telefone obrigava a mexer nos quinze.
 */
export default function EmailTemplateEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [d, setD] = useState<any>({
    is_active: true, is_sms: false, is_sub_template: false, booking_priority: false,
    data_source: 'Reservations', sort_order: 0, texts: [], ...row,
  });
  const [cultura, setCultura] = useState('');
  const [previa, setPrevia] = useState<any>(null);

  const { data: linguas = [] } = useQuery({
    queryKey: ['posc', 'languages'],
    queryFn: async () => (await apiClient.get('pos/config/languages/')).data,
  });
  const { data: variaveis = [] } = useQuery({
    queryKey: ['posc', 'variables', d.data_source],
    queryFn: async () => (await apiClient.get('pos/config/variables/')).data,
  });

  const culturas: string[] = (linguas as any[])
    .filter((l) => l.is_active && l.culture_code)
    .map((l) => l.culture_code);
  const atual = cultura || culturas[0] || 'pt-PT';
  const texto = (d.texts || []).find((t: any) => t.culture === atual) || { culture: atual, subject: '', body: '' };

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/email-templates/', d)
      : apiClient.patch(`pos/config/email-templates/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({
        title: 'Modelo gravado',
        message: 'É este o e-mail que o hotel passa a enviar. As línguas em falta ficam marcadas a vermelho na lista.',
      });
      onClose();
    },
    onError: notifyError,
  });

  const prever = useMutation({
    mutationFn: () => apiClient.post(`pos/config/email-templates/${row.id}/preview/`, { culture: atual }),
    onSuccess: (r: any) => setPrevia(r.data),
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const setTexto = (k: 'subject' | 'body', v: string) => {
    const outros = (d.texts || []).filter((t: any) => t.culture !== atual);
    set('texts', [...outros, { ...texto, culture: atual, [k]: v }]);
  };
  const inserir = (campo: string) => setTexto('body', `${texto.body || ''}@Model[0].${campo}`);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Novo modelo' : `A editar ${d.code}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-2 max-w-[1100px]">
          <div className="flex items-center gap-8 pl-[120px]">
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
              Ativo
            </label>
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={!!d.is_sms} onChange={(e) => set('is_sms', e.target.checked)} className="w-4 h-4" />
              SMS
            </label>
          </div>

          <Row label="Código:">
            <input value={d.code || ''} onChange={(e) => set('code', e.target.value.toUpperCase())}
              className={`${inp} flex-1`} style={inputStyle} />
          </Row>
          <Row label="Descrição:">
            <input value={d.name || ''} onChange={(e) => set('name', e.target.value)}
              className={`${inp} flex-1`} style={inputStyle} />
          </Row>
          <Row label="Remetente:">
            <input value={d.sender || ''} onChange={(e) => set('sender', e.target.value)}
              className={`${inp} flex-1`} style={inputStyle} />
          </Row>
          <Row label="Enviar e-mail para:">
            <input value={d.send_to || ''} onChange={(e) => set('send_to', e.target.value)}
              placeholder="@Model[0].GuestEmail" className={`${inp} flex-1 font-mono`} style={inputStyle} />
          </Row>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Row label="Estado da Reserva:">
                <select value={d.reservation_state || ''} onChange={(e) => set('reservation_state', e.target.value)}
                  className={`${inp} flex-1`} style={inputStyle}>
                  <option value="">—</option>
                  <option value="NORMAL">Normal</option>
                  <option value="PENDING">Pendente</option>
                  <option value="CONFIRMED">Confirmada</option>
                  <option value="CANCELLED">Cancelada</option>
                </select>
              </Row>
              <Row label="Secção:">
                <input value={d.section || ''} onChange={(e) => set('section', e.target.value)}
                  className={`${inp} flex-1`} style={inputStyle} />
              </Row>
              <Row label="Ordem:">
                <input type="number" value={d.sort_order ?? 0} onChange={(e) => set('sort_order', Number(e.target.value))}
                  className={`${inp} w-[120px]`} style={inputStyle} />
                <label className="flex items-center gap-2 text-[12px] ml-3 whitespace-nowrap">
                  <input type="checkbox" checked={!!d.booking_priority}
                    onChange={(e) => set('booking_priority', e.target.checked)} className="w-4 h-4" />
                  Prioritário para o Booking Engine
                </label>
              </Row>
              <Row label="Fonte de dados:">
                <select value={d.data_source} onChange={(e) => set('data_source', e.target.value)}
                  className={`${inp} flex-1`} style={inputStyle}>
                  {[['Reservations', 'Reservas'], ['Invoices', 'Faturas'], ['FixedCharges', 'Encargos'],
                    ['HotelInfo', 'Dados do Hotel'], ['EMenuOrders', 'Pedidos e-Menu'],
                    ['Events', 'Eventos'], ['PosTickets', 'Contas POS']].map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-[12px] ml-3 whitespace-nowrap">
                  <input type="checkbox" checked={!!d.is_sub_template}
                    onChange={(e) => set('is_sub_template', e.target.checked)} className="w-4 h-4" />
                  Sub-Modelo
                </label>
              </Row>
            </div>
            <div className="space-y-2">
              <Row label="Cc:">
                <input value={d.cc || ''} onChange={(e) => set('cc', e.target.value)} className={`${inp} flex-1`} style={inputStyle} />
              </Row>
              <Row label="Bcc:">
                <input value={d.bcc || ''} onChange={(e) => set('bcc', e.target.value)} className={`${inp} flex-1`} style={inputStyle} />
              </Row>
              {d.is_sub_template && (
                <div className="text-[11px] text-[#666] bg-[#f7f7f7] border border-[#e0e0e0] px-2 py-1">
                  Sub-modelo: não se envia sozinho — é incluído por outros modelos.
                </div>
              )}
            </div>
          </div>

          {/* Línguas */}
          <div className="flex border-b-2 border-[#2b2b2b] mt-3">
            {culturas.map((c) => {
              const tem = (d.texts || []).some((t: any) => t.culture === c && (t.subject || t.body));
              return (
                <button key={c} onClick={() => setCultura(c)}
                  className={`px-6 py-1.5 text-[12px] font-semibold border-b-[3px] ${atual === c
                    ? 'border-[#2b2b2b] text-[#111] bg-white' : 'border-transparent text-[#666] hover:text-[#111]'}`}>
                  {c}
                  {!tem && <span className="ml-1 text-[#c0392b]" title="Sem texto nesta língua">●</span>}
                </button>
              );
            })}
          </div>

          <div className="flex gap-3 pt-2">
            <div className="flex-1 space-y-2">
              <Row label="Assunto:">
                <input value={texto.subject || ''} onChange={(e) => setTexto('subject', e.target.value)}
                  className={`${inp} flex-1`} style={inputStyle} />
              </Row>
              <label className="flex items-start gap-3 text-[12px]">
                <span className="w-[120px] flex-shrink-0 text-[#333] pt-1">Texto:</span>
                <textarea value={texto.body || ''} onChange={(e) => setTexto('body', e.target.value)} rows={10}
                  className={`${inp} flex-1 font-mono`} style={inputStyle} />
              </label>
            </div>

            {/* Variáveis */}
            <div className="w-[300px] border border-[#c8c8c8] flex flex-col">
              <div className="px-2 py-1.5 bg-[#f0f0f0] text-[12px] font-bold border-b border-[#d0d0d0]">
                Variáveis — clique para inserir
              </div>
              <div className="h-[240px] overflow-auto">
                <table className="w-full text-[11px]">
                  <tbody>
                    {(variaveis as any[]).slice(0, 200).map((v) => (
                      <tr key={v.id} onClick={() => inserir(v.field)}
                        className="border-b border-[#eee] cursor-pointer hover:bg-[#e6f0fa]">
                        <td className="px-2 py-1 font-mono text-[#1a4f8a]">@Model[0].{v.field}</td>
                        <td className="px-2 py-1 text-[#666]">{v.name}</td>
                      </tr>
                    ))}
                    {(variaveis as any[]).length === 0 && (
                      <tr><td className="text-center text-[#999] py-6">
                        Sem variáveis. Crie-as em <b>Modelos - Variáveis</b>.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {previa && (
            <div className={`border mt-3 ${previa.unknown?.length
              ? 'border-[#e6b0aa] bg-[#fdecea]' : 'border-[#b6d7b9] bg-[#e8f5e9]'}`}>
              <div className="px-3 py-1.5 text-[12px] font-bold border-b border-black/10">
                Pré-visualização ({atual}) — {previa.detail}
              </div>
              <div className="p-3 text-[12px] space-y-2 bg-white">
                <div><b>Assunto:</b> {previa.subject}</div>
                <pre className="whitespace-pre-wrap font-sans text-[12px]">{previa.body}</pre>
              </div>
            </div>
          )}
        </div>
      </div>

      <Toolbar actions={[
        { icon: '🔍', label: prever.isPending ? 'A gerar…' : 'Pré-visualizar', color: '#1a73c8',
          disabled: isNew, onClick: () => prever.mutate() },
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
