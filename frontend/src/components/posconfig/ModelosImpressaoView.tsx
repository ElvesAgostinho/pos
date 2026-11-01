import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { TOKENS } from '../../config/theme';
import { Box, Toolbar, Field, Sel, Glyph, inputCls } from './kit';
import ClassicGrid from '../ui/ClassicGrid';
import { previewComModelo } from '../fiscal/printInvoice';

/**
 * MODELOS DE IMPRESSÃO — como cada documento sai no papel.
 *
 * ─── O QUE ISTO VEIO RESOLVER ─────────────────────────────────────────────
 * O desenho da factura estava escrito no código: a cor, o que aparecia e o que
 * não, o texto do rodapé. Uma casa que quisesse o IBAN no papel, ou a sua cor,
 * ou uma linha para assinar, obrigava a alterar o programa — e um programa
 * certificado pela AGT não se altera por causa do gosto de um cliente.
 *
 * Havia tabela (`cfg_document_template`) e havia API desde o princípio. O que
 * nunca houve foi ECRÃ: a ficha existia e ninguém lhe chegava. E o papel A4
 * ignorava-a por completo — só o talão térmico lia de lá duas linhas.
 *
 * ─── PORQUE É QUE A PRÉ-VISUALIZAÇÃO É A FACTURA A SÉRIO ──────────────────
 * Esta janela não desenha uma imitação do papel. Chama `previewComModelo`, que
 * é o MESMO código que a impressora corre, com os valores que estão nas caixas
 * ao lado — ainda antes de gravar.
 *
 * Uma pré-visualização desenhada à parte mostra o que o programador acha que
 * vai sair. No dia em que o papel mudar e a imitação não, passa a mentir — e
 * quem confia nela só descobre com a factura na mão do hóspede.
 *
 * ─── E PORQUE É QUE NÃO HÁ CAIXA PARA TUDO ────────────────────────────────
 * Não se deixa desligar nada do que a lei exige: número, data, NIF das duas
 * partes, quadro resumo do IVA, total por extenso, QR da AGT e a menção do
 * programa validado. Uma factura sem eles não é uma factura mal desenhada — é
 * uma factura inválida, e quem responde por isso é o hotel, não nós.
 */

/** Os tipos de documento que têm papel próprio. */
const TIPOS: { code: string; nome: string }[] = [
  { code: 'FT', nome: 'Factura' },
  { code: 'FR', nome: 'Factura-recibo' },
  { code: 'FS', nome: 'Factura simplificada' },
  { code: 'NC', nome: 'Nota de crédito' },
  { code: 'ND', nome: 'Nota de débito' },
  { code: 'RC', nome: 'Recibo' },
  { code: 'PROFORMA', nome: 'Pró-forma' },
  { code: 'ORCAMENTO', nome: 'Orçamento' },
  { code: 'ENCOMENDA', nome: 'Encomenda' },
  { code: 'VOUCHER', nome: 'Voucher' },
  { code: 'BEO', nome: 'Ordem de evento (BEO)' },
];
const nomeDoTipo = (c: string) => TIPOS.find((t) => t.code === c)?.nome || c;

const FORMATOS = [
  { v: 'A4', t: 'A4' }, { v: 'A5', t: 'A5' },
  { v: 'THERMAL_80', t: 'Talão 80mm' }, { v: 'THERMAL_58', t: 'Talão 58mm' },
];

/** Um documento de exemplo para a pré-visualização ter o que mostrar.
 *
 * É inventado de propósito e diz que é: "ARTIGO DE DEMONSTRAÇÃO". Usar uma
 * factura verdadeira aqui mostrava dados de um hóspede a quem ninguém pediu
 * licença, num ecrã de configuração onde entra quem não é da recepção. */
const EXEMPLO = {
  company: {
    name: 'O nome legal da sua empresa, Lda.', trade_name: 'O Seu Hotel',
    nif: '5000000000', address: 'Rua de exemplo, 100', city: 'Luanda',
    province: 'Luanda', phone: '+244 900 000 000', email: 'geral@exemplo.ao',
    share_capital: '1.000.000,00 Kz', crc_number: 'CRC Luanda 000-00',
  },
  document: {
    invoice_no: 'FT 2026/000123', type_name: 'Factura', copy_label: 'Original',
    date: new Date().toISOString().slice(0, 10), operator: 'recepcao', room: '203',
  },
  customer: { name: 'Nome do hóspede', nif: '0000000000', address: 'Morada do hóspede' },
  lines: [
    { quantity: '2', description: 'Alojamento — Quarto duplo (ARTIGO DE DEMONSTRAÇÃO)', unit_price: '45000', discount: '0', tax_percentage: '14', total: '102600' },
    { quantity: '1', description: 'Pequeno-almoço', unit_price: '7500', discount: '0', tax_percentage: '14', total: '8550' },
    { quantity: '3', description: 'Bar — bebidas', unit_price: '2500', discount: '750', tax_percentage: '14', total: '7695' },
  ],
  tax_summary: [{ rate: 14, base: '105250', tax: '14735', total: '119985' }],
  payments: [{ method: 'Numerário', amount: '60000' }, { method: 'Multicaixa', amount: '59985' }],
  totals: { net: '105250', discount: '750', tax: '14735', gross: '119985' },
  amount_in_words: 'cento e dezanove mil novecentos e oitenta e cinco kwanzas',
  print_mention: 'Processado por programa validado n.º 000/AGT/2026',
  bank_accounts: [] as any[],
};

const VAZIO = {
  name: '', doc_type: 'FT', page_format: 'A4', accent_color: '#1F3A5F', logo_height_mm: 16,
  header: '', footer: '', bank_details: '', payment_terms: '', legal_notes: '',
  signature_label: '', show_logo: true, show_qr: true, show_payments: true,
  show_signature_line: false, show_bank_details: false, show_page_numbers: true,
  is_default: false, is_active: true,
};

export default function ModelosImpressaoView() {
  const qc = useQueryClient();
  const { data: lista = [], isLoading } = useQuery<any[]>({
    queryKey: ['modelos-impressao'],
    queryFn: async () => {
      const r = await apiClient.get('platform/document-templates/');
      return (r.data?.results || r.data || []) as any[];
    },
  });

  const [sel, setSel] = useState<number | null>(null);
  const [f, setF] = useState<any>(VAZIO);
  const [novo, setNovo] = useState(false);

  useEffect(() => {
    if (novo || sel === null) return;
    const linha = lista.find((x) => x.id === sel);
    if (linha) setF({ ...VAZIO, ...linha });
  }, [sel, lista, novo]);

  const gravar = useMutation({
    mutationFn: async () => {
      const corpo = { ...f };
      if (novo || !f.id) return (await apiClient.post('platform/document-templates/', corpo)).data;
      return (await apiClient.patch(`platform/document-templates/${f.id}/`, corpo)).data;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['modelos-impressao'] });
      setNovo(false); setSel(d?.id ?? sel);
    },
  });

  const apagar = useMutation({
    mutationFn: async (id: number) => apiClient.delete(`platform/document-templates/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modelos-impressao'] });
      setSel(null); setF(VAZIO);
    },
  });

  // O HTML da pré-visualização. Recalcula-se a cada tecla — é barato (é só
  // texto) e é o que faz com que escrever o rodapé e vê-lo aparecer sejam a
  // mesma acção, em vez de escrever, gravar, imprimir e só então descobrir.
  const html = useMemo(() => {
    try { return previewComModelo(EXEMPLO, f); } catch { return '<p>—</p>'; }
  }, [f]);

  const editar = (campo: string, valor: any) => setF((v: any) => ({ ...v, [campo]: valor }));

  return (
    <div className="flex-1 flex flex-col overflow-hidden text-[11.5px]">
      <Toolbar
        actions={[
          { icon: '📄', label: 'Novo modelo',
            onClick: () => { setNovo(true); setSel(null); setF({ ...VAZIO }); } },
          { icon: '📋', label: gravar.isPending ? 'A gravar…' : 'Gravar',
            disabled: !f.name || gravar.isPending, onClick: () => gravar.mutate() },
          { icon: '🗑', label: 'Apagar', disabled: !f.id,
            onClick: () => f.id && apagar.mutate(f.id) },
        ]}
        right={gravar.isError
          ? <span style={{ color: '#9A4236' }}>Não foi possível gravar. Verifique o nome e o tipo.</span>
          : null} />

      <div className="flex-1 flex overflow-hidden">
        {/* ─── A LISTA ─── */}
        <div className="w-[230px] flex-shrink-0 border-r overflow-auto"
          style={{ borderColor: TOKENS.chromeLine, background: '#FFFFFF' }}>
          <ClassicGrid
            columns={[
              { header: 'Modelo', accessor: 'name', width: '58%' },
              { header: 'Tipo', accessor: 'tipo', width: '42%' },
            ]}
            data={lista.map((r) => ({ ...r, tipo: nomeDoTipo(r.doc_type) }))}
            selectedRowId={sel}
            onRowClick={(r: any) => { setNovo(false); setSel(r.id); }} />
          {/* SEM MODELOS NÃO É UM ERRO — é o estado normal de uma instalação
              nova, e o papel sai à mesma. Dizê-lo evita que alguém pense que a
              lista não carregou. */}
          {!isLoading && lista.length === 0 && (
            <div className="px-2 py-3 text-[11px]" style={{ color: '#6B7280' }}>
              Ainda não há modelos. Os documentos saem com o desenho de fábrica,
              que é completo e legal.
            </div>
          )}
        </div>

        {/* ─── A FICHA ─── */}
        <div className="w-[320px] flex-shrink-0 border-r overflow-auto p-2"
          style={{ borderColor: TOKENS.chromeLine, background: TOKENS.chrome }}>
          <Box title="Identificação">
            <Field label="Nome" empilhado>
              <input value={f.name || ''} onChange={(e) => editar('name', e.target.value)}
                className={inputCls} placeholder="Ex.: Factura — papel timbrado" />
            </Field>
            <Field label="Tipo de documento" empilhado>
              <Sel value={f.doc_type} onChange={(v) => editar('doc_type', v)}
                options={TIPOS.map((t) => ({ value: t.code, label: `${t.code} — ${t.nome}` }))} />
            </Field>
            <Field label="Formato" empilhado>
              <Sel value={f.page_format} onChange={(v) => editar('page_format', v)}
                options={FORMATOS.map((x) => ({ value: x.v, label: x.t }))} />
            </Field>
            <Caixa label="Activo" checked={!!f.is_active} onChange={(v) => editar('is_active', v)} />
            <Caixa label="Predefinido para este tipo" checked={!!f.is_default}
              onChange={(v) => editar('is_default', v)} />
          </Box>

          <Box title="A marca da casa">
            {/* A COR não é decoração: é a única coisa no papel que diz, antes de
                se ler nada, de que hotel é aquela factura. */}
            <div className="flex items-center gap-2 px-1 py-[3px]">
              <label className="w-[108px]" style={{ color: '#5A5A5A' }}>Cor</label>
              <input type="color" value={f.accent_color || '#1F3A5F'}
                onChange={(e) => editar('accent_color', e.target.value)}
                className="w-[34px] h-[20px] border p-0" style={{ borderColor: TOKENS.field }} />
              <input type="text" value={f.accent_color || ''} onChange={(e) => editar('accent_color', e.target.value)}
                className="flex-1 border px-1 h-[20px]" style={{ borderColor: TOKENS.field }} />
            </div>
            <Caixa label="Mostrar logótipo" checked={!!f.show_logo} onChange={(v) => editar('show_logo', v)} />
            <Field label="Altura do logótipo (mm)" empilhado>
              <input type="number" min={5} max={40} value={f.logo_height_mm ?? 16}
                onChange={(e) => editar('logo_height_mm', Number(e.target.value) || 0)}
                className={inputCls} />
            </Field>
            <div className="px-1 pb-1" style={{ color: '#6B7280', fontSize: 10.5 }}>
              O logótipo é o que carregou em Empresa. Sem logótipo não se põe imagem nenhuma —
              o papel do hotel não leva a marca de quem fez o programa.
            </div>
          </Box>

          <Box title="O que acrescenta">
            <Area label="Texto no topo" value={f.header} onChange={(v) => editar('header', v)} />
            <Area label="Condições de pagamento" value={f.payment_terms}
              onChange={(v) => editar('payment_terms', v)} />
            <Area label="Dados para transferência" value={f.bank_details}
              onChange={(v) => editar('bank_details', v)} />
            <Area label="Notas legais" value={f.legal_notes} onChange={(v) => editar('legal_notes', v)} />
            <Area label="Texto no rodapé" value={f.footer} onChange={(v) => editar('footer', v)} />
          </Box>

          <Box title="O que se mostra">
            <Caixa label="Formas de pagamento" checked={!!f.show_payments}
              onChange={(v) => editar('show_payments', v)} />
            <Caixa label="Dados para transferência" checked={!!f.show_bank_details}
              onChange={(v) => editar('show_bank_details', v)} />
            <Caixa label="Linha para assinar" checked={!!f.show_signature_line}
              onChange={(v) => editar('show_signature_line', v)} />
            {f.show_signature_line && (
              <Field label="Quem assina" empilhado>
                <input value={f.signature_label || ''} onChange={(e) => editar('signature_label', e.target.value)}
                  className={inputCls} placeholder="O prestador" />
              </Field>
            )}
            <Caixa label="Código QR da AGT" checked={!!f.show_qr} onChange={(v) => editar('show_qr', v)} />
            {!f.show_qr && (
              <div className="px-1 pb-1" style={{ color: '#9A4236', fontSize: 10.5 }}>
                Sem o QR, uma factura fiscal fica fora da lei. Só o desligue em documentos
                que não são fiscais (orçamento, pró-forma, voucher).
              </div>
            )}
          </Box>
        </div>

        {/* ─── O PAPEL ─── */}
        <div className="flex-1 overflow-auto p-3" style={{ background: '#9AA0A6' }}>
          <div className="mx-auto" style={{ width: 760, maxWidth: '100%' }}>
            <div className="mb-1.5 text-[10.5px] flex items-center gap-2" style={{ color: '#FFFFFF' }}>
              <Glyph icon="🔍" size={13} />
              Pré-visualização com valores de exemplo — é o mesmo desenho que sai na impressora.
            </div>
            {/* `srcDoc` e não um nó desta página: o HTML do papel traz a sua própria
                folha de estilo, com regras para `body`, `table` e `@page`. Injectado
                aqui dentro, pintava o ERP inteiro. Dentro de um iframe, fica só dele. */}
            <iframe title="Pré-visualização" srcDoc={html}
              style={{ width: '100%', height: 1000, border: '1px solid #6E6E6E', background: '#fff' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Caixa de visto, com a etiqueta clicável. */
function Caixa({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 px-1 py-[3px] cursor-pointer hover:bg-[#FDF4D9]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** Texto de várias linhas — rodapés e notas legais nunca cabem numa. */
function Area({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  return (
    <div className="px-1 py-[3px]">
      <div style={{ color: '#5A5A5A' }}>{label}</div>
      <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} rows={2}
        className="w-full border px-1 py-[2px] text-[11.5px]"
        style={{ borderColor: TOKENS.field, resize: 'vertical' }} />
    </div>
  );
}
