/**
 * Traduz erros técnicos da API em linguagem humana, com ORIENTAÇÃO do que fazer.
 * Objetivo: o utilizador nunca ver "400 Bad Request" ou JSON cru — vê o que falhou
 * e como resolver.
 */
export interface Guide { title: string; message: string; hint?: string; fields?: string[]; }

// Nomes técnicos → nomes que as pessoas percebem.
const FIELD_PT: Record<string, string> = {
  code: 'Código', name: 'Nome', number: 'Número', room_type: 'Tipo de quarto',
  base_uom: 'Unidade de medida', category: 'Categoria', item: 'Artigo', quantity: 'Quantidade',
  price: 'Preço', unit_price: 'Preço unitário', sale_price: 'Preço de venda',
  supplier: 'Fornecedor', warehouse: 'Armazém', outlet: 'Outlet', hotel: 'Hotel',
  customer_name: 'Nome do cliente', customer_tax_id: 'NIF', series: 'Série',
  table_number: 'Número da mesa', seats: 'Lugares', account: 'Conta', journal: 'Diário',
  entry_date: 'Data', description: 'Descrição', amount: 'Valor', date: 'Data',
  start_date: 'Data de início', check_in: 'Entrada', check_out: 'Saída',
  username: 'Utilizador', password: 'Palavra-passe', email: 'Email',
  lines: 'Linhas', profile: 'Perfil', status: 'Estado',
};
const label = (f: string) => FIELD_PT[f] || f.replace(/_/g, ' ');

// Mensagens do DRF/Django → português claro.
function humanize(msg: string, field?: string): string {
  const m = String(msg);
  const f = field ? label(field) : 'este campo';
  if (/required|obrigat/i.test(m)) return `Falta preencher: ${f}.`;
  if (/blank|em branco/i.test(m)) return `${f} não pode ficar vazio.`;
  if (/already exists|unique|já existe/i.test(m)) return `Já existe um registo com este ${f.toLowerCase()}. Use outro.`;
  if (/valid integer|número inteiro/i.test(m)) return `${f} tem de ser um número inteiro.`;
  if (/valid number|número válido/i.test(m)) return `${f} tem de ser um número.`;
  if (/valid date|data válida/i.test(m)) return `${f} tem de ser uma data válida.`;
  if (/does not exist|não existe|invalid pk/i.test(m)) return `O ${f.toLowerCase()} escolhido não existe (foi apagado?). Escolha outro.`;
  if (/protected|referenced|foreign key/i.test(m)) return `Não é possível eliminar: este registo está a ser usado noutro sítio.`;
  if (/null/i.test(m) && /not.*allow/i.test(m)) return `${f} é obrigatório.`;
  return m;
}

export function friendlyError(err: any): Guide {
  // Sem resposta = servidor em baixo / rede.
  if (!err?.response) {
    return {
      title: 'Sem ligação ao servidor',
      message: 'A aplicação não conseguiu contactar o servidor.',
      hint: 'Verifique se o servidor está a correr e tente novamente.',
    };
  }
  const { status, data } = err.response;

  if (status === 401) return { title: 'Sessão expirada', message: 'A sua sessão terminou.', hint: 'Inicie sessão outra vez.' };
  if (status === 403) return { title: 'Sem permissão', message: 'Não tem autorização para esta operação.', hint: 'Peça ao administrador para lhe dar acesso (Segurança → Acessos por Perfil).' };
  if (status === 404) return { title: 'Não encontrado', message: 'O registo já não existe (pode ter sido apagado).', hint: 'Atualize a lista e tente de novo.' };
  if (status === 429) return { title: 'Demasiados pedidos', message: 'Fez pedidos a mais em pouco tempo.', hint: 'Aguarde um momento e repita.' };
  if (status >= 500) return { title: 'Erro no servidor', message: 'Ocorreu um erro interno ao processar o pedido.', hint: 'Se voltar a acontecer, contacte o suporte.' };

  // 400 — erros de validação (o caso mais comum).
  if (status === 400 && data) {
    // {"detail": "..."} — regra de negócio
    if (typeof data === 'string') return { title: 'Não foi possível concluir', message: data };
    if (data.detail) return { title: 'Não foi possível concluir', message: humanize(data.detail), hint: 'Corrija e tente novamente.' };

    // {"campo": ["mensagem", ...], ...}
    const problems: string[] = [];
    const fields: string[] = [];
    for (const [field, val] of Object.entries<any>(data)) {
      const msgs = Array.isArray(val) ? val : [val];
      for (const m of msgs) {
        if (typeof m === 'object') { problems.push(`${label(field)}: ${JSON.stringify(m)}`); }
        else problems.push(humanize(m, field));
      }
      fields.push(field);
    }
    if (problems.length) {
      return {
        title: problems.length === 1 ? 'Falta um dado' : 'Faltam alguns dados',
        message: problems.join('\n'),
        hint: 'Preencha o que falta e volte a gravar.',
        fields,
      };
    }
  }
  return { title: 'Não foi possível concluir', message: 'Ocorreu um erro inesperado.', hint: 'Tente novamente.' };
}

/** Mostra o popup explicativo (ouvido pelo <GuideDialog/> global). */
export function notifyError(err: any) {
  window.dispatchEvent(new CustomEvent('erp:guide', { detail: friendlyError(err) }));
}

/** Popup de orientação sem erro (ex.: pré-requisitos em falta). */
export function notifyGuide(g: Guide) {
  window.dispatchEvent(new CustomEvent('erp:guide', { detail: g }));
}
