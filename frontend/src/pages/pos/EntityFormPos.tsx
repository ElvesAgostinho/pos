import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { aviso } from '../../ui/dialogo';
import { ComTeclado, CampoTatil, EscolhaTatil, CaixaTatil } from './CampoTatil';
import { useArrastar } from './useArrastar';
import { IcoVisto, IcoCruz } from './Icons';

/**
 * NOVA ENTIDADE — a ficha do cliente, preenchida no terminal.
 *
 * É a MESMA ficha do backoffice (mdm.Customer). Não há um cadastro do restaurante e
 * outro da faturação: o NIF que aqui se escreve é o que sai impresso na fatura, o saldo
 * que aqui se define é o que a conta corrente vai respeitar, e o consumo desta conta
 * entra no histórico desta entidade. Dois cadastros separados dão sempre a mesma
 * discussão no fim do mês — "mas este cliente não é o mesmo?".
 *
 * TODOS os campos abrem TECLADO ao toque: alfanumérico no texto, numérico nos números.
 * Num balcão não há teclado físico — um campo que não traz o teclado consigo é um campo
 * que nunca se preenche.
 *
 * DUAS MORADAS, em abas: a principal (onde o cliente está) e a de FATURAÇÃO (para onde
 * vai a fatura). São diferentes muito mais vezes do que parece — a empresa fatura na
 * sede e janta na filial —, e misturá-las é mandar a fatura para o sítio errado.
 *
 * APELIDO e PAÍS a vermelho: são os que a ficha exige. Vê-se o que falta antes de tentar
 * gravar, em vez de descobrir no fim.
 */
export default function EntityFormPos({ entidade, onGravado, onClose }: {
  /** para editar; vazio = nova */
  entidade?: any | null;
  onGravado: (e: any) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<any>({
    entity_type: '', tax_id: '', last_name: '', name: '', other_names: '',
    address: '', address2: '', address3: '', postal_code: '', city: '',
    country: 'Angola', region: '', nationality: '', email: '', doc_type: '',
    phone: '', doc_valid_until: '', id_number: '', gender: '', birth_date: '',
    billing_address: '', billing_address2: '', billing_postal: '', billing_city: '',
    billing_country: '', allow_cc_checkout: false, cc_by: '', credit_limit: '',
    credit_limit_pos: '', credit_limit_pos_enabled: false,
    ...(entidade || {}),
  });
  const [aba, setAba] = useState<'PRINCIPAL' | 'FATURACAO'>('PRINCIPAL');
  const [busy, setBusy] = useState(false);
  const { ref, pegar, pos } = useArrastar();

  const set = (k: string) => (v: any) => setD((o: any) => ({ ...o, [k]: v }));

  const { data: tipos = [] } = useQuery({
    queryKey: ['pos-entity-types'],
    queryFn: async () => {
      try {
        const r = await apiClient.get('pos/config/customer-types/');
        return (r.data?.results || r.data || []) as any[];
      } catch { return []; }
    },
  });

  const gravar = async () => {
    if (!String(d.last_name || '').trim() && !String(d.name || '').trim()) {
      return aviso('O APELIDO (ou o Nome) é obrigatório.', 'Falta preencher');
    }
    if (!String(d.country || '').trim()) return aviso('O PAÍS é obrigatório.', 'Falta preencher');
    setBusy(true);
    try {
      // O NOME da ficha é o que sai na fatura: junta-se apelido + nome, como no original.
      const nome = [d.name, d.last_name].filter((x) => String(x || '').trim()).join(' ').trim();
      const corpo: any = { ...d, name: nome || d.last_name || d.name };
      // campos vazios seguem como null — string vazia num campo de data rebenta o servidor
      Object.keys(corpo).forEach((k) => { if (corpo[k] === '') corpo[k] = null; });
      delete corpo.id;
      const r = entidade?.id
        ? await apiClient.patch(`pos/marketing/entities/${entidade.id}/`, corpo)
        : await apiClient.post('pos/marketing/entities/', corpo);
      onGravado(r.data);
    } catch (e: any) {
      const x = e?.response?.data;
      aviso(x?.detail || (x && typeof x === 'object'
        ? Object.entries(x).map(([k, v]) => `${k}: ${v}`).join('\n') : 'Não foi possível gravar.'));
    } finally { setBusy(false); }
  };

  const Aba = ({ k, label }: { k: 'PRINCIPAL' | 'FATURACAO'; label: string }) => (
    <button onClick={() => setAba(k)}
      className={`px-6 h-[46px] text-[16px] font-bold border-2 border-black
        ${aba === k ? 'bg-gradient-to-b from-[#d4ac00] to-[#8a6f00] text-white'
          : 'bg-gradient-to-b from-[#3a3a3a] to-[#222] text-white/80'}`}>
      {label}
    </button>
  );

  return (
    <ComTeclado>
      <div className="fixed inset-0 bg-black/60 flex items-start justify-center pt-4 z-[65]">
        <div ref={ref} className="w-[1180px] max-w-[96vw] max-h-[94vh] bg-[#2b2b2b]
          border-[3px] border-black shadow-2xl flex flex-col"
          style={pos ? { position: 'fixed', left: pos.x, top: pos.y } : undefined}>

          <div onMouseDown={pegar} onTouchStart={pegar}
            className="h-[58px] bg-gradient-to-b from-[#4a4a4a] to-[#2e2e2e] border-b-2 border-black
              flex items-center px-3 cursor-grab active:cursor-grabbing select-none flex-shrink-0">
            <span className="w-[46px] flex flex-col gap-[3px] opacity-45">
              <span className="h-[2px] bg-white rounded" />
              <span className="h-[2px] bg-white rounded" />
              <span className="h-[2px] bg-white rounded" />
            </span>
            <span className="flex-1 text-center text-white text-[23px] font-bold">
              {entidade?.id ? 'Editar entidade' : 'Nova entidade'}
            </span>
            <span className="w-[46px]" />
          </div>

          <div className="flex-1 overflow-auto pos-arrasta p-2 space-y-1">
            <EscolhaTatil label="Tipo de entidade" valor={d.entity_type} onChange={set('entity_type')}
              opcoes={tipos.map((t: any) => ({ id: t.id, label: t.name }))} />
            <CampoTatil chave="tax_id" label="Nr. contrib." valor={d.tax_id}
              onChange={set('tax_id')} tipo="numero" />
            <CampoTatil chave="last_name" label="Apelido" valor={d.last_name}
              onChange={set('last_name')} obrigatorio />
            <CampoTatil chave="name" label="Nome" valor={d.name} onChange={set('name')} />
            <CampoTatil chave="other_names" label="Outros nomes" valor={d.other_names}
              onChange={set('other_names')} />

            {/* ── as duas moradas ── */}
            <div className="flex gap-1 pt-2">
              <Aba k="PRINCIPAL" label="Morada principal" />
              <Aba k="FATURACAO" label="Morada de Faturação" />
            </div>

            <div className="border-2 border-black p-1 space-y-1 bg-black/20">
              {aba === 'PRINCIPAL' ? (
                <>
                  <CampoTatil chave="address" label="Morada 1" valor={d.address} onChange={set('address')} />
                  <CampoTatil chave="address2" label="Morada 2" valor={d.address2} onChange={set('address2')} />
                  <CampoTatil chave="address3" label="Morada 3" valor={d.address3} onChange={set('address3')} />
                  <CampoTatil chave="postal_code" label="Cód. postal" valor={d.postal_code}
                    onChange={set('postal_code')} />
                  <CampoTatil chave="city" label="Cidade" valor={d.city} onChange={set('city')} />
                  <div className="flex gap-1">
                    <CampoTatil chave="country" label="País" valor={d.country}
                      onChange={set('country')} obrigatorio />
                    <CampoTatil chave="region" label="Região" valor={d.region} onChange={set('region')} />
                  </div>
                </>
              ) : (
                <>
                  <CampoTatil chave="billing_address" label="Morada 1" valor={d.billing_address}
                    onChange={set('billing_address')} />
                  <CampoTatil chave="billing_address2" label="Morada 2" valor={d.billing_address2}
                    onChange={set('billing_address2')} />
                  <CampoTatil chave="billing_postal" label="Cód. postal" valor={d.billing_postal}
                    onChange={set('billing_postal')} />
                  <CampoTatil chave="billing_city" label="Cidade" valor={d.billing_city}
                    onChange={set('billing_city')} />
                  <CampoTatil chave="billing_country" label="País" valor={d.billing_country}
                    onChange={set('billing_country')} />
                </>
              )}
            </div>

            {/* ── identificação e contactos ── */}
            <div className="flex gap-1 pt-1">
              <CampoTatil chave="nationality" label="Nacionalidade" valor={d.nationality}
                onChange={set('nationality')} />
              <CampoTatil chave="email" label="E-mail" valor={d.email} onChange={set('email')} />
            </div>
            <div className="flex gap-1">
              <CampoTatil chave="doc_type" label="Tipo Doc." valor={d.doc_type} onChange={set('doc_type')} />
              <CampoTatil chave="phone" label="Telefone" valor={d.phone} onChange={set('phone')} tipo="numero" />
            </div>
            <div className="flex gap-1">
              <CampoTatil chave="doc_valid_until" label="Validade" valor={d.doc_valid_until}
                onChange={set('doc_valid_until')} />
              <CampoTatil chave="id_number" label="Nr. de identif." valor={d.id_number}
                onChange={set('id_number')} />
            </div>
            <div className="flex gap-1">
              <EscolhaTatil label="Género" valor={d.gender} onChange={set('gender')}
                opcoes={[{ id: 'M', label: 'Masculino' }, { id: 'F', label: 'Feminino' }]} />
              <CampoTatil chave="birth_date" label="Data de nasc." valor={d.birth_date}
                onChange={set('birth_date')} />
            </div>

            {/* ── conta corrente e crédito ──
                É aqui que se decide se este cliente pode levar fiado, e até quanto. Um
                limite por escrever é um limite infinito — e é assim que se acumula
                dívida sem ninguém dar por ela. */}
            <div className="border-2 border-black p-1 space-y-1 bg-black/20 mt-2">
              <div className="flex gap-1">
                <CaixaTatil label="Permitir check-out para conta corrente"
                  valor={!!d.allow_cc_checkout} onChange={set('allow_cc_checkout')} />
                <CampoTatil chave="cc_by" label="C. correntes por" valor={d.cc_by} onChange={set('cc_by')} />
              </div>
              <CampoTatil chave="credit_limit" label="Limite crédito" valor={d.credit_limit}
                onChange={set('credit_limit')} tipo="numero" />
              <div className="flex gap-1">
                <CampoTatil chave="credit_limit_pos" label="POS Limite créd." valor={d.credit_limit_pos}
                  onChange={set('credit_limit_pos')} tipo="numero" />
                <CaixaTatil label="Ativo no POS" largura="w-[210px]"
                  valor={!!d.credit_limit_pos_enabled} onChange={set('credit_limit_pos_enabled')} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 bg-black flex-shrink-0">
            <button onClick={gravar} disabled={busy}
              className="h-[64px] rounded-[3px] flex items-center justify-center gap-3 text-white
                text-[19px] font-bold border-2 border-black
                bg-gradient-to-b from-[#4a4a4a] to-[#242424]
                shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.55)]
                active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)] disabled:opacity-40">
              <span className="text-[#2ecc40]"><IcoVisto size={28} /></span>
              {busy ? 'A gravar…' : 'Gravar'}
            </button>
            <button onClick={onClose}
              className="h-[64px] rounded-[3px] flex items-center justify-center gap-3 text-white
                text-[19px] font-bold border-2 border-black
                bg-gradient-to-b from-[#4a4a4a] to-[#242424]
                shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.55)]
                active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]">
              <span className="text-[#e02020]"><IcoCruz size={28} /></span>
              Fechar
            </button>
          </div>
        </div>
      </div>
    </ComTeclado>
  );
}
