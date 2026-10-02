import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Toolbar } from '../posconfig/kit';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';

/** Chatbot — assistente de reservas por WhatsApp. "Configuração" guarda as
    credenciais da Meta Business API (não usadas ainda para enviar nada a
    sério — ver nota no ecrã). "Simular Conversa" fala com
    `pms/chatbot/simulate/`, que responde com disponibilidade REAL, mas
    NUNCA envia uma mensagem WhatsApp verdadeira. */

type Msg = { from: 'user' | 'bot'; text: string };

export default function PmsChatbotView() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'ligacao' | 'config' | 'sim'>('ligacao');
  const [testarPara, setTestarPara] = useState('');

  const { data: list } = useQuery({ queryKey: ['pms', 'chatbot-settings'], queryFn: async () => (await apiClient.get('pms/chatbot-settings/')).data });
  const settings = (list?.results || list || [])[0];
  const [f, setF] = useState<any>({
    whatsapp_phone_number: '', whatsapp_business_account_id: '', access_token: '',
    is_active: false, connection_mode: 'BRIDGE', pairing_method: 'QR',
    bridge_url: '', bridge_token: '',
    welcome_message: 'Olá! Posso ajudar a verificar disponibilidade e criar uma reserva. Como posso ajudar?',
  });
  useEffect(() => { if (settings) setF({ ...settings }); }, [settings?.id]);

  const save = useMutation({
    mutationFn: async () => settings
      ? (await apiClient.patch(`pms/chatbot-settings/${settings.id}/`, f)).data
      : (await apiClient.post('pms/chatbot-settings/', f)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pms', 'chatbot-settings'] }); aviso('Configuração guardada.'); },
    onError: (e: any) => notifyError(e),
  });

  // Enquanto o QR está no ecrã, pergunta-se à ponte de 3 em 3 segundos se já
  // foi lido — é assim que o WhatsApp Web se comporta, e evita o dono ficar a
  // olhar para um código já aceite. Pára assim que liga (ou desiste).
  const emEspera = settings?.session_status === 'PAIRING';
  const { data: sessao } = useQuery({
    queryKey: ['pms', 'chatbot-session', settings?.id],
    queryFn: async () => (await apiClient.get(`pms/chatbot-settings/${settings.id}/session/`)).data,
    enabled: !!settings?.id && emEspera && tab === 'ligacao',
    refetchInterval: 3000,
  });
  useEffect(() => {
    if (sessao && sessao.session_status !== settings?.session_status) {
      qc.invalidateQueries({ queryKey: ['pms', 'chatbot-settings'] });
    }
  }, [sessao?.session_status]);
  const estado = sessao || settings;

  const ligar = useMutation({
    mutationFn: async () => (await apiClient.post(`pms/chatbot-settings/${settings.id}/connect/`, {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pms', 'chatbot-settings'] }),
    onError: notifyError,
  });
  const desligar = useMutation({
    mutationFn: async () => (await apiClient.post(`pms/chatbot-settings/${settings.id}/disconnect/`, {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pms', 'chatbot-settings'] }),
    onError: notifyError,
  });
  const testar = useMutation({
    mutationFn: async () => (await apiClient.post(`pms/chatbot-settings/${settings.id}/send-test/`, { to: testarPara })).data,
    onSuccess: (d: any) => aviso(d.detail, 'WhatsApp'),
    onError: notifyError,
  });

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => { boxRef.current?.scrollTo(0, boxRef.current.scrollHeight); }, [msgs]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setMsgs((m) => [...m, { from: 'user', text }]);
    setDraft(''); setSending(true);
    try {
      const r = await apiClient.post('pms/chatbot/simulate/', { message: text });
      setMsgs((m) => [...m, { from: 'bot', text: r.data.reply }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { from: 'bot', text: e?.response?.data?.detail || 'Erro ao simular resposta.' }]);
    } finally { setSending(false); }
  };

  const inp = 'border border-[#D7DBDF] p-1.5 text-[12px] w-full';

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex border-b border-[#D7DBDF] bg-[#F3F4F6]">
        {(['ligacao', 'config', 'sim'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-[12px] font-semibold border-r border-[#D7DBDF] ${tab === t ? 'bg-white text-[#1A1D21] border-b-2 border-b-[#1F4E79]' : 'text-[#6B7280] hover:bg-white'}`}>
            {t === 'ligacao' ? 'Ligação' : t === 'config' ? 'Configuração' : 'Simular Conversa'}
          </button>
        ))}
        <div className="flex-1" />
        {settings && (
          <div className="flex items-center gap-2 px-4 text-[11px]">
            <span className="w-2 h-2 rounded-full" style={{
              background: estado?.session_status === 'CONNECTED' ? '#1E7F4F'
                : estado?.session_status === 'PAIRING' ? '#B45309'
                : estado?.session_status === 'ERROR' ? '#B42318' : '#6B7280' }} />
            <span className="text-[#6B7280]">{estado?.session_status_display || 'Desligado'}
              {estado?.connected_number ? ` · ${estado.connected_number}` : ''}</span>
          </div>
        )}
      </div>

      {tab === 'ligacao' ? (
        <PainelLigacao f={f} setF={setF} estado={estado} settings={settings}
          ligar={ligar} desligar={desligar} testar={testar}
          testarPara={testarPara} setTestarPara={setTestarPara} inp={inp} />
      ) : tab === 'config' ? (
        <div className="flex-1 overflow-auto p-4 space-y-3 text-[12px]">
          <div className="bg-[#F3F4F6] border border-[#D7DBDF] p-3">
            <label className="flex items-center gap-2 mb-2">
              <input type="checkbox" checked={!!f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
              Assistente <b>ativo</b>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">Nº WhatsApp Business<input className={inp} value={f.whatsapp_phone_number || ''} onChange={(e) => setF({ ...f, whatsapp_phone_number: e.target.value })} placeholder="+244 9XX XXX XXX" /></label>
              <label className="flex flex-col gap-1">WhatsApp Business Account ID<input className={inp} value={f.whatsapp_business_account_id || ''} onChange={(e) => setF({ ...f, whatsapp_business_account_id: e.target.value })} /></label>
              <label className="flex flex-col gap-1 col-span-2">Access Token (Meta)<input className={inp} type="password" value={f.access_token || ''} onChange={(e) => setF({ ...f, access_token: e.target.value })} /></label>
              <label className="flex flex-col gap-1 col-span-2">Mensagem de boas-vindas<textarea className={inp} rows={2} value={f.welcome_message || ''} onChange={(e) => setF({ ...f, welcome_message: e.target.value })} /></label>
            </div>
          </div>
          <div className="p-3 bg-[#F3F4F6] border border-[#EBEEF0] text-[11px] text-[#6B7280]">
            <b>Envio real por WhatsApp pendente:</b> estes campos ficam guardados, mas o envio de mensagens a sério só liga quando a conta WhatsApp Business do dono estiver homologada pela Meta (Cloud API) — o mesmo tipo de passo comercial do Channel Manager com as OTAs. Até lá, use a aba "Simular Conversa" para testar o comportamento com dados reais, sem enviar nada.
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div ref={boxRef} className="flex-1 overflow-auto p-3 space-y-2 bg-[#F3F4F6]">
            {msgs.length === 0 && (
              <div className="text-gray-400 text-[12px] text-center py-8">
                Experimente escrever "olá" ou "disponibilidade de quartos" — a resposta de disponibilidade usa dados reais do sistema (próximos 7-9 dias), nunca envia nada por WhatsApp.
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-3 py-2 text-[12px] whitespace-pre-wrap rounded ${m.from === 'user' ? 'bg-[#17375E] text-white' : 'bg-white border border-[#D7DBDF] text-[#1A1D21]'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {sending && <div className="text-gray-400 text-[11px]">a responder…</div>}
          </div>
          <div className="flex items-center gap-2 p-2 border-t border-[#D7DBDF] bg-white">
            <input className={inp} value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder="Escreva uma mensagem…" />
          </div>
        </div>
      )}

      {(tab === 'config' || tab === 'ligacao') && (
        <Toolbar actions={[{ label: 'Guardar', icon: '💾', color: '#17375E', onClick: () => save.mutate() }]} />
      )}
      {tab === 'sim' && (
        <Toolbar actions={[
          { label: 'Enviar', icon: '✔', color: '#17375E', onClick: send, disabled: !draft.trim() || sending },
          { label: 'Limpar conversa', icon: '✕', color: '#B42318', onClick: () => setMsgs([]), disabled: msgs.length === 0 },
        ]} />
      )}
    </div>
  );
}


/**
 * LIGAÇÃO DO WHATSAPP — as duas formas que existem na vida real.
 *
 * A oficial (Meta Cloud API) é o caminho homologado mas exige conta Business
 * aprovada pela Meta, o que um hotel pequeno pode esperar semanas. A não
 * oficial liga o número que o hotel JÁ usa, por QR Code ou por código enviado
 * ao telemóvel — em minutos. Quem mantém a sessão viva é um serviço de ponte à
 * parte (as bibliotecas do WhatsApp Web são Node e precisam de uma ligação
 * sempre aberta, coisa que um processo web não faz); aqui configura-se o
 * endereço dele e mostra-se o que ele devolve.
 */
function PainelLigacao({ f, setF, estado, settings, ligar, desligar, testar, testarPara, setTestarPara, inp }: any) {
  const modo = f.connection_mode || 'OFFICIAL';
  const ligado = estado?.session_status === 'CONNECTED';
  const emparelhando = estado?.session_status === 'PAIRING';

  const Cartao = ({ valor, titulo, texto, selo }: any) => (
    <button type="button" onClick={() => setF({ ...f, connection_mode: valor })}
      className={`flex-1 text-left p-3 rounded-[10px] border transition-colors ${
        modo === valor ? 'border-[#17375E] bg-white shadow-sm' : 'border-[#D7DBDF] bg-[#F3F4F6] hover:bg-white'}`}>
      <div className="flex items-center gap-2">
        <span className={`w-3.5 h-3.5 rounded-full border-[4px] ${modo === valor ? 'border-[#17375E]' : 'border-[#D7DBDF]'}`} />
        <span className="font-bold text-[12.5px] text-[#1A1D21]">{titulo}</span>
        {selo && <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-[#F3F4F6] text-[#6B7280] font-semibold uppercase tracking-wide">{selo}</span>}
      </div>
      <div className="text-[11px] text-[#6B7280] mt-1.5 leading-relaxed">{texto}</div>
    </button>
  );

  return (
    <div className="flex-1 overflow-auto p-4 space-y-3 text-[12px] bg-[#F7F8F9]">
      {!settings && (
        <div className="p-3 rounded-[8px] bg-[#FDF3E3] border border-[#E6C98A] text-[#B45309]">
          Grave a configuração uma primeira vez (botão <b>Guardar</b>, em baixo) para poder ligar a conta.
        </div>
      )}

      <div className="flex gap-3">
        <Cartao valor="BRIDGE" titulo="API não oficial" selo="liga em minutos"
          texto="Usa o número que o hotel já tem. Liga-se lendo um QR Code com o telemóvel, ou recebendo um código de 8 letras — tal como o WhatsApp Web. Precisa de um serviço de ponte a correr." />
        <Cartao valor="OFFICIAL" titulo="API oficial (Meta)" selo="homologada"
          texto="O caminho oficial da Meta: sem risco de bloqueio e com modelos de mensagem aprovados. Exige conta WhatsApp Business verificada e aprovação da Meta." />
      </div>

      {modo === 'BRIDGE' ? (
        <div className="bg-white border border-[#D7DBDF] rounded-[10px] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">Endereço do serviço de ponte
              <input className={inp} value={f.bridge_url || ''} placeholder="https://wa.ohotel.ao"
                onChange={(e) => setF({ ...f, bridge_url: e.target.value })} /></label>
            <label className="flex flex-col gap-1">Chave do serviço
              <input className={inp} type="password" value={f.bridge_token || ''}
                onChange={(e) => setF({ ...f, bridge_token: e.target.value })} /></label>
          </div>

          <div>
            <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wide mb-1.5">Como emparelhar</div>
            <div className="flex gap-2">
              {[['QR', 'Ler QR Code', 'Abra o WhatsApp no telemóvel → Dispositivos ligados → Ligar dispositivo.'],
                ['PHONE', 'Código para o telemóvel', 'O WhatsApp pede um código de 8 letras no telefone do hotel.']]
                .map(([v, t, d]: any) => (
                <button key={v} type="button" onClick={() => setF({ ...f, pairing_method: v })}
                  className={`flex-1 text-left px-3 py-2 rounded-[8px] border text-[11.5px] ${
                    (f.pairing_method || 'QR') === v ? 'border-[#17375E] bg-[#F3F4F6]' : 'border-[#D7DBDF] hover:bg-[#F3F4F6]'}`}>
                  <div className="font-semibold text-[#1A1D21]">{t}</div>
                  <div className="text-[10.5px] text-[#6B7280] mt-0.5">{d}</div>
                </button>
              ))}
            </div>
          </div>

          {(f.pairing_method || 'QR') === 'PHONE' && (
            <label className="flex flex-col gap-1">Número de telemóvel do hotel (com indicativo)
              <input className={inp} value={f.whatsapp_phone_number || ''} placeholder="+244 9XX XXX XXX"
                onChange={(e) => setF({ ...f, whatsapp_phone_number: e.target.value })} /></label>
          )}

          {/* O PALCO: QR, código, ou a confirmação de que ficou ligado. */}
          <div className="rounded-[10px] border border-[#D7DBDF] bg-[#F3F4F6] p-4 flex flex-col items-center justify-center min-h-[210px]">
            {ligado ? (
              <>
                <div className="w-12 h-12 rounded-full bg-[#1E7F4F] text-white flex items-center justify-center text-[22px]">✓</div>
                <div className="font-bold text-[13px] text-[#1A1D21] mt-2">WhatsApp ligado</div>
                <div className="text-[11.5px] text-[#6B7280] mt-0.5">
                  {estado?.connected_number || f.whatsapp_phone_number}
                  {estado?.connected_at ? ` · desde ${new Date(estado.connected_at).toLocaleString('pt-PT')}` : ''}
                </div>
              </>
            ) : emparelhando && estado?.qr_png ? (
              <>
                <img src={estado.qr_png} alt="QR Code" className="w-[190px] h-[190px] bg-white p-2 rounded-[8px] border border-[#D7DBDF]" />
                <div className="text-[11.5px] text-[#6B7280] mt-2 text-center max-w-[340px]">
                  No telemóvel: <b>WhatsApp → Dispositivos ligados → Ligar dispositivo</b> e aponte a
                  câmara a este código. Ele caduca ao fim de um minuto — carregue em <b>Ligar</b> para
                  gerar outro.
                </div>
              </>
            ) : emparelhando && estado?.pairing_code ? (
              <>
                <div className="text-[11px] text-[#6B7280] uppercase tracking-wide">Código de emparelhamento</div>
                <div className="font-mono font-bold text-[30px] tracking-[0.18em] text-[#1A1D21] mt-1">
                  {estado.pairing_code}</div>
                <div className="text-[11.5px] text-[#6B7280] mt-2 text-center max-w-[340px]">
                  No telemóvel <b>{f.whatsapp_phone_number}</b>: WhatsApp → Dispositivos ligados →
                  Ligar com número de telefone, e escreva este código.
                </div>
              </>
            ) : estado?.session_status === 'ERROR' ? (
              <>
                <div className="w-11 h-11 rounded-full bg-[#B42318] text-white flex items-center justify-center text-[20px]">!</div>
                <div className="text-[11.5px] text-[#B42318] mt-2 text-center max-w-[420px]">
                  {estado?.session_message || 'Não foi possível ligar.'}</div>
              </>
            ) : (
              <div className="text-[11.5px] text-[#6B7280] text-center max-w-[380px]">
                Grave o endereço do serviço e carregue em <b>Ligar</b>.
                {(f.pairing_method || 'QR') === 'QR'
                  ? ' Aparece aqui um QR Code para ler com o telemóvel.'
                  : ' Aparece aqui um código para escrever no telemóvel do hotel.'}
              </div>
            )}
            {emparelhando && (
              <div className="text-[10.5px] text-[#B45309] mt-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B45309] animate-pulse" />
                à espera de confirmação no telemóvel…
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#D7DBDF] rounded-[10px] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">Nº WhatsApp Business
              <input className={inp} value={f.whatsapp_phone_number || ''} placeholder="+244 9XX XXX XXX"
                onChange={(e) => setF({ ...f, whatsapp_phone_number: e.target.value })} /></label>
            <label className="flex flex-col gap-1">WhatsApp Business Account ID
              <input className={inp} value={f.whatsapp_business_account_id || ''}
                onChange={(e) => setF({ ...f, whatsapp_business_account_id: e.target.value })} /></label>
            <label className="flex flex-col gap-1 col-span-2">Access Token (Meta)
              <input className={inp} type="password" value={f.access_token || ''}
                onChange={(e) => setF({ ...f, access_token: e.target.value })} /></label>
          </div>
          <div className="text-[11px] text-[#6B7280] bg-[#F3F4F6] border border-[#EBEEF0] rounded-[8px] p-3">
            Estas credenciais obtêm-se no <b>Meta Business Suite → WhatsApp → Configuração da API</b>,
            depois de a conta do hotel ser verificada. Enquanto a Meta não aprovar o número, o envio
            real não sai — use a <b>API não oficial</b> para ligar já o número que o hotel tem.
          </div>
          {estado?.session_message && (
            <div className="text-[11px] text-[#6B7280]">{estado.session_message}</div>
          )}
        </div>
      )}

      {settings && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => ligar.mutate()} disabled={ligar.isPending}
            className="px-4 py-2 rounded-[8px] text-white text-[12px] font-semibold disabled:opacity-50"
            style={{ background: '#17375E' }}>
            {ligar.isPending ? 'A ligar…' : emparelhando ? 'Gerar novo código' : 'Ligar'}
          </button>
          {(ligado || emparelhando) && (
            <button onClick={() => desligar.mutate()} disabled={desligar.isPending}
              className="px-4 py-2 rounded-[8px] text-[12px] font-semibold border border-[#D7DBDF] hover:bg-[#F3F4F6]">
              Desligar
            </button>
          )}
          {ligado && (
            <div className="flex items-center gap-2 ml-auto">
              <input className="border border-[#D7DBDF] rounded-[6px] px-2 py-1.5 text-[12px] w-[180px]"
                placeholder="+244 9XX XXX XXX" value={testarPara}
                onChange={(e) => setTestarPara(e.target.value)} />
              <button onClick={() => testar.mutate()} disabled={!testarPara.trim() || testar.isPending}
                className="px-3 py-2 rounded-[8px] text-[12px] font-semibold border border-[#D7DBDF] hover:bg-[#F3F4F6] disabled:opacity-40">
                Enviar mensagem de teste
              </button>
            </div>
          )}
        </div>
      )}

      <div className="text-[11px] text-[#6B7280] leading-relaxed">
        A ponte é um serviço separado que fala o protocolo do WhatsApp Web (Baileys, whatsapp-web.js
        e afins) e se instala no mesmo servidor do hotel. O sistema nunca dá uma sessão por ligada
        sem a ponte o confirmar — o que está aqui em cima é sempre o estado real.
      </div>
    </div>
  );
}
