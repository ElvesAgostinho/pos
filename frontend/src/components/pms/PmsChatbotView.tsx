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
  const [tab, setTab] = useState<'config' | 'sim'>('config');

  const { data: list } = useQuery({ queryKey: ['pms', 'chatbot-settings'], queryFn: async () => (await apiClient.get('pms/chatbot-settings/')).data });
  const settings = (list?.results || list || [])[0];
  const [f, setF] = useState<any>({
    whatsapp_phone_number: '', whatsapp_business_account_id: '', access_token: '',
    is_active: false, welcome_message: 'Olá! Posso ajudar a verificar disponibilidade e criar uma reserva. Como posso ajudar?',
  });
  useEffect(() => { if (settings) setF({ ...settings }); }, [settings?.id]);

  const save = useMutation({
    mutationFn: async () => settings
      ? (await apiClient.patch(`pms/chatbot-settings/${settings.id}/`, f)).data
      : (await apiClient.post('pms/chatbot-settings/', f)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pms', 'chatbot-settings'] }); aviso('Configuração guardada.'); },
    onError: (e: any) => notifyError(e),
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

  const inp = 'border border-[#7FA9B1] p-1.5 text-[12px] w-full';

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex border-b border-[#7FA9B1] bg-[#F7FAFA]">
        {(['config', 'sim'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-[12px] font-semibold border-r border-[#CFE3E6] ${tab === t ? 'bg-white text-[#062A31] border-b-2 border-b-[#0B4F5C]' : 'text-[#5C8891] hover:bg-white'}`}>
            {t === 'config' ? 'Configuração' : 'Simular Conversa'}
          </button>
        ))}
      </div>

      {tab === 'config' ? (
        <div className="flex-1 overflow-auto p-4 space-y-3 text-[12px]">
          <div className="bg-[#F7FAFA] border border-[#CFE3E6] p-3">
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
          <div className="p-3 bg-[#F7FAFA] border border-[#EEF4F5] text-[11px] text-[#5C8891]">
            <b>Envio real por WhatsApp pendente:</b> estes campos ficam guardados, mas o envio de mensagens a sério só liga quando a conta WhatsApp Business do dono estiver homologada pela Meta (Cloud API) — o mesmo tipo de passo comercial do Channel Manager com as OTAs. Até lá, use a aba "Simular Conversa" para testar o comportamento com dados reais, sem enviar nada.
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div ref={boxRef} className="flex-1 overflow-auto p-3 space-y-2 bg-[#F7FAFA]">
            {msgs.length === 0 && (
              <div className="text-gray-400 text-[12px] text-center py-8">
                Experimente escrever "olá" ou "disponibilidade de quartos" — a resposta de disponibilidade usa dados reais do sistema (próximos 7-9 dias), nunca envia nada por WhatsApp.
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-3 py-2 text-[12px] whitespace-pre-wrap rounded ${m.from === 'user' ? 'bg-[#062A31] text-white' : 'bg-white border border-[#CFE3E6] text-[#041F24]'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {sending && <div className="text-gray-400 text-[11px]">a responder…</div>}
          </div>
          <div className="flex items-center gap-2 p-2 border-t border-[#CFE3E6] bg-white">
            <input className={inp} value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder="Escreva uma mensagem…" />
          </div>
        </div>
      )}

      {tab === 'config' && (
        <Toolbar actions={[{ label: 'Guardar', icon: '💾', color: '#062A31', onClick: () => save.mutate() }]} />
      )}
      {tab === 'sim' && (
        <Toolbar actions={[
          { label: 'Enviar', icon: '✔', color: '#062A31', onClick: send, disabled: !draft.trim() || sending },
          { label: 'Limpar conversa', icon: '✕', color: '#B0392B', onClick: () => setMsgs([]), disabled: msgs.length === 0 },
        ]} />
      )}
    </div>
  );
}
