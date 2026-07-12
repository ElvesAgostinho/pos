import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { FormSection, Field, btnPrimary, btnNormal } from '../ui/FormKit';
import { Building2, Save, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';

/**
 * FICHA DO HOTEL — onde se preenche tudo o que identifica a propriedade.
 * Antes isto não existia: os dados fiscais estavam na base de dados sem ecrã nenhum
 * para os introduzir, e o hotel só tinha "nome" e "localização".
 */
export default function HotelProfileView() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'hotel' | 'fiscal' | 'banks' | 'cert'>('hotel');
  const [h, setH] = useState<any>({});
  const [f, setF] = useState<any>({});

  // Contas bancárias — saem impressas no rodapé da fatura (é como o cliente paga).
  const { data: banks = [] } = useQuery({
    queryKey: ['fiscal', 'banks'],
    queryFn: async () => { const r = await apiClient.get('fiscal/bank-accounts/'); return r.data?.results || r.data || []; },
  });
  const emptyBank = { bank_name: '', iban: '', account_number: '', swift: '', currency: 'AOA', account_holder: '', show_on_invoice: true };
  const [nb, setNb] = useState<any>(emptyBank);
  const invalBanks = () => qc.invalidateQueries({ queryKey: ['fiscal', 'banks'] });
  const addBank = useMutation({
    mutationFn: () => apiClient.post('fiscal/bank-accounts/', nb),
    onSuccess: () => { setNb(emptyBank); invalBanks(); }, onError: notifyError,
  });
  const updBank = useMutation({
    mutationFn: ({ id, data }: any) => apiClient.patch(`fiscal/bank-accounts/${id}/`, data),
    onSuccess: invalBanks, onError: notifyError,
  });
  const delBank = useMutation({
    mutationFn: (id: number) => apiClient.delete(`fiscal/bank-accounts/${id}/`),
    onSuccess: invalBanks, onError: notifyError,
  });

  const { data } = useQuery({
    queryKey: ['org', 'hotel-profile'],
    queryFn: async () => (await apiClient.get('org/hotel-profile/')).data,
  });
  useEffect(() => { if (data) { setH(data.hotel || {}); setF(data.fiscal || {}); } }, [data]);

  const save = useMutation({
    mutationFn: () => apiClient.patch('org/hotel-profile/', { hotel: h, fiscal: f }),
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      const c = r.data?.completeness;
      notifyGuide({
        title: 'Ficha do hotel guardada',
        message: c?.missing?.length
          ? `Ficha ${c.percent}% completa. Ainda faltam ${c.missing.length} dado(s) obrigatório(s).`
          : 'Ficha completa. Os dados passam a sair nas faturas, nas reservas e no SAF-T.',
        hint: c?.missing?.length ? c.missing.map((m: any) => `${m.label}: ${m.why}`).join('\n') : undefined,
      });
    },
    onError: notifyError,
  });

  const c = data?.completeness;
  const cert = data?.certification;
  const miss = (field: string) => (c?.missing || []).find((m: any) => m.field === field)?.why;

  const Tab = ({ id, label }: any) => (
    <button onClick={() => setTab(id)}
      className={`px-4 py-1.5 text-[12px] font-bold border border-b-0 ${tab === id ? 'bg-white text-[#25405e] border-[#9aa6b6]' : 'bg-[#dfe3e8] text-gray-600 border-[#c0c7d0]'}`}>
      {label}
    </button>
  );

  return (
    <ClassicWindow title="Ficha do Hotel — Dados da Propriedade" icon={<Building2 size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Estes dados saem nas faturas, nas reservas e no SAF-T — é a identidade do hotel em todo o sistema</div>}>
      <div className="h-full flex flex-col bg-[#dfe3e8] overflow-auto">

        {/* Completude — o que falta e porquê */}
        {c && (
          <div className={`m-3 mb-0 p-2.5 border flex items-start gap-2 text-[12px] ${c.missing.length ? 'bg-[#fff7e6] border-[#e0c080]' : 'bg-[#eafaf0] border-[#8fce9e]'}`}>
            {c.missing.length ? <AlertTriangle size={18} className="text-amber-700 flex-shrink-0 mt-0.5" />
              : <CheckCircle2 size={18} className="text-green-700 flex-shrink-0 mt-0.5" />}
            <div className="flex-1">
              <div className="font-bold flex items-center gap-2">
                Ficha {c.percent}% completa
                <span className="inline-block w-40 h-2 bg-[#d8dde3] border border-[#b0b8c2]">
                  <span className="block h-full" style={{ width: `${c.percent}%`, background: c.missing.length ? '#c9820a' : '#1f7a34' }} />
                </span>
              </div>
              {c.missing.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-gray-700">
                  {c.missing.map((m: any) => (
                    <li key={m.field}><b>{m.label}</b> em falta — {m.why}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="px-3 pt-3 flex gap-1">
          <Tab id="hotel" label="Propriedade & Contactos" />
          <Tab id="fiscal" label="Dados Fiscais (saem na fatura)" />
          <Tab id="banks" label="Contas Bancárias" />
          <Tab id="cert" label="Certificação AGT" />
        </div>

        <div className="mx-3 mb-3 bg-[#eef1f4] border border-[#9aa6b6] p-3 flex-1 overflow-auto">
          {tab === 'hotel' && (
            <>
              <FormSection title="Identificação da propriedade">
                <Field label="Nome do hotel" required value={h.name} onChange={(v) => setH({ ...h, name: v })} help={miss('name')} />
                <Field label="Tipo" value={h.hotel_type} onChange={(v) => setH({ ...h, hotel_type: v })}
                  options={['Hotel', 'Resort', 'Lodge', 'Pousada', 'Apartamento', 'Guest House'].map((x) => ({ value: x, label: x }))} />
                <Field label="Classificação (estrelas)" type="number" value={h.stars} onChange={(v) => setH({ ...h, stars: v })} />
                <Field label="Ano de abertura" type="number" value={h.opened_year} onChange={(v) => setH({ ...h, opened_year: v })} />
              </FormSection>

              <FormSection title="Morada e contactos" hint="usados nas reservas e na comunicação com o hóspede">
                <Field label="Morada" span value={h.address} onChange={(v) => setH({ ...h, address: v })} />
                <Field label="Cidade" value={h.city} onChange={(v) => setH({ ...h, city: v })} />
                <Field label="Província" value={h.province} onChange={(v) => setH({ ...h, province: v })} />
                <Field label="País" value={h.country} onChange={(v) => setH({ ...h, country: v })} />
                <Field label="Telefone" required value={h.phone} onChange={(v) => setH({ ...h, phone: v })} help={miss('phone')} />
                <Field label="Email" required type="email" value={h.email} onChange={(v) => setH({ ...h, email: v })} help={miss('email')} />
                <Field label="Website" value={h.website} onChange={(v) => setH({ ...h, website: v })} />
              </FormSection>

              <FormSection title="Operação" hint="usados pelo PMS no check-in, no check-out e no fecho do dia">
                <Field label="Hora de check-in" type="time" value={h.check_in_time} onChange={(v) => setH({ ...h, check_in_time: v })}
                  help="A partir desta hora o quarto pode ser entregue ao hóspede." />
                <Field label="Hora de check-out" type="time" value={h.check_out_time} onChange={(v) => setH({ ...h, check_out_time: v })}
                  help="Depois desta hora, a saída conta como atraso." />
                <Field label="Moeda" value={h.currency} onChange={(v) => setH({ ...h, currency: v })}
                  options={[{ value: 'AOA', label: 'Kwanza (AOA)' }, { value: 'USD', label: 'Dólar (USD)' }, { value: 'EUR', label: 'Euro (EUR)' }]} />
                <Field label="Fuso horário" value={h.timezone} onChange={(v) => setH({ ...h, timezone: v })} />
              </FormSection>
            </>
          )}

          {tab === 'fiscal' && (
            <>
              <FormSection title="Empresa (o que sai no cabeçalho da fatura)">
                <Field label="Nome legal da empresa" required span value={f.company_name} onChange={(v) => setF({ ...f, company_name: v })} help={miss('company_name')} />
                <Field label="Nome comercial" value={f.trade_name} onChange={(v) => setF({ ...f, trade_name: v })} help="O nome pelo qual o hotel é conhecido." />
                <Field label="NIF" required value={f.company_nif} onChange={(v) => setF({ ...f, company_nif: v })} help={miss('company_nif') || 'Contribuinte da empresa emissora.'} />
                <Field label="Repartição fiscal" value={f.tax_office} onChange={(v) => setF({ ...f, tax_office: v })} />
                <Field label="Regime fiscal" value={f.tax_regime} onChange={(v) => setF({ ...f, tax_regime: v })} />
                <Field label="Regime de IVA" value={f.vat_regime} onChange={(v) => setF({ ...f, vat_regime: v })} />
                <Field label="Capital social" value={f.share_capital} onChange={(v) => setF({ ...f, share_capital: v })} />
                <Field label="C.R.C. nº" value={f.crc_number} onChange={(v) => setF({ ...f, crc_number: v })} help="Conservatória do Registo Comercial." />
              </FormSection>

              <FormSection title="Morada fiscal" hint="obrigatória na fatura e no SAF-T">
                <Field label="Morada" required span value={f.address_line} onChange={(v) => setF({ ...f, address_line: v })} help={miss('address_line')} />
                <Field label="Cidade" value={f.city} onChange={(v) => setF({ ...f, city: v })} />
                <Field label="Província" value={f.province} onChange={(v) => setF({ ...f, province: v })} />
                <Field label="Telefone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
                <Field label="Fax" value={f.fax} onChange={(v) => setF({ ...f, fax: v })} />
                <Field label="Email" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
              </FormSection>

              <FormSection title="Faturação">
                <Field label="NIF de consumidor final" value={f.generic_customer_nif} onChange={(v) => setF({ ...f, generic_customer_nif: v })}
                  help="Usado quando o cliente não dá contribuinte." />
                <Field label="QR Code nas faturas" type="checkbox" value={f.qr_enabled} onChange={(v) => setF({ ...f, qr_enabled: v })}
                  help="Exigido pela AGT nos documentos assinados." />
                <Field label="Logótipo (URL)" span value={f.logo_url} onChange={(v) => setF({ ...f, logo_url: v })}
                  help="Sai impresso no topo da fatura." />
              </FormSection>
            </>
          )}

          {tab === 'banks' && (
            <>
              <FormSection title="Contas bancárias impressas na fatura" cols={1}
                hint="é por aqui que o cliente lhe paga — sem isto, ele recebe a fatura e não sabe para onde transferir">
                <table className="w-full text-[12px] border-collapse">
                  <thead>
                    <tr style={{ background: 'linear-gradient(to bottom, #f7f9fb, #e4e9ef)' }} className="text-[#25405e]">
                      {['Banco', 'IBAN', 'Nº de conta', 'SWIFT', 'Moeda', 'Sai na fatura', ''].map((x) => (
                        <th key={x} className="text-left font-bold px-2 py-1 border-b border-[#c0c7d0]">{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {banks.map((b: any) => (
                      <tr key={b.id} className="border-b border-[#e6e9ed]">
                        <td className="px-2 py-1 font-bold">{b.bank_name}</td>
                        <td className="px-2 py-1 font-mono text-[11px]">{b.iban || '—'}</td>
                        <td className="px-2 py-1 font-mono text-[11px]">{b.account_number || '—'}</td>
                        <td className="px-2 py-1">{b.swift || '—'}</td>
                        <td className="px-2 py-1">{b.currency}</td>
                        <td className="px-2 py-1">
                          <input type="checkbox" checked={!!b.show_on_invoice}
                            onChange={(e) => updBank.mutate({ id: b.id, data: { show_on_invoice: e.target.checked } })} />
                        </td>
                        <td className="px-2 py-1">
                          <button onClick={() => confirm(`Remover a conta ${b.bank_name}?`) && delBank.mutate(b.id)}
                            className="text-red-600 hover:text-red-800 text-[11px] font-bold">Remover</button>
                        </td>
                      </tr>
                    ))}
                    {banks.length === 0 && (
                      <tr><td colSpan={7} className="text-center text-gray-400 py-6">
                        Ainda não há contas bancárias — as faturas saem sem indicação de pagamento.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </FormSection>

              <FormSection title="Acrescentar conta bancária">
                <Field label="Banco" required value={nb.bank_name} onChange={(v) => setNb({ ...nb, bank_name: v })}
                  help="Ex.: Banco BFA, BAI, BIC…" />
                <Field label="Titular da conta" value={nb.account_holder} onChange={(v) => setNb({ ...nb, account_holder: v })}
                  help="Normalmente o nome legal da empresa." />
                <Field label="IBAN" value={nb.iban} onChange={(v) => setNb({ ...nb, iban: v })} help="Ex.: AO06 0000 0000 0000 0000 0000 0" />
                <Field label="Nº de conta" value={nb.account_number} onChange={(v) => setNb({ ...nb, account_number: v })} />
                <Field label="SWIFT / BIC" value={nb.swift} onChange={(v) => setNb({ ...nb, swift: v })} help="Necessário para transferências do estrangeiro." />
                <Field label="Moeda" value={nb.currency} onChange={(v) => setNb({ ...nb, currency: v })}
                  options={[{ value: 'AOA', label: 'Kwanza (AOA)' }, { value: 'USD', label: 'Dólar (USD)' }, { value: 'EUR', label: 'Euro (EUR)' }]} />
                <div className="col-span-full">
                  <button onClick={() => nb.bank_name ? addBank.mutate() : notifyGuide({ title: 'Falta o banco', message: 'Indique o nome do banco antes de acrescentar a conta.' })}
                    {...btnNormal}>Acrescentar conta</button>
                </div>
              </FormSection>
            </>
          )}

          {tab === 'cert' && (
            <FormSection title="Certificação AGT" cols={1}
              hint="pertence ao software — instalada pelo fornecedor">
              <div className={`p-3 border flex items-center gap-3 ${cert?.certified ? 'bg-[#eafaf0] border-[#8fce9e]' : 'bg-[#fff7e6] border-[#e0c080]'}`}>
                {cert?.certified ? <ShieldCheck size={26} className="text-green-700" /> : <ShieldAlert size={26} className="text-amber-700" />}
                <div className="text-[12px]">
                  <div className={`font-bold ${cert?.certified ? 'text-green-800' : 'text-amber-800'}`}>
                    {cert?.certified ? `Certificado AGT nº ${cert.certificate_number}` : 'Ainda não certificado (ambiente de testes)'}
                  </div>
                  <div className="text-gray-600 text-[11px]">
                    Ambiente: {cert?.environment === 'PROD' ? 'Produção' : 'Testes'} · chave de assinatura v{cert?.key_version}
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-gray-700 mt-2">
                O número de certificação é atribuído pela AGT ao <b>programa</b>, não à sua empresa — e é o mesmo em todos
                os clientes deste software. Assim que a certificação for emitida, passa a sair <b>automaticamente</b> em todas
                as faturas, no QR Code e no SAF-T, sem que tenha de configurar nada. Não é editável aqui, por segurança:
                a chave que assina as suas faturas nunca esteve nas suas mãos.
              </div>
            </FormSection>
          )}
        </div>

        <div className="px-3 pb-3 flex gap-2">
          <button onClick={() => save.mutate()} disabled={save.isPending} {...btnPrimary}>
            <span className="flex items-center gap-1.5"><Save size={13} />{save.isPending ? 'A guardar…' : 'Guardar ficha'}</span>
          </button>
          <button onClick={() => { if (data) { setH(data.hotel); setF(data.fiscal); } }} {...btnNormal}>Desfazer alterações</button>
        </div>
      </div>
    </ClassicWindow>
  );
}
