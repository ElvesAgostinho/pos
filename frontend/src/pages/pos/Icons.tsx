/**
 * OS ÍCONES DO TERMINAL — desenhados, não emoji.
 *
 * Os emoji (🔍 🗑 💰) são desenhados pelo SISTEMA: mudam de forma entre o Windows, o
 * Android e o iPhone, vêm coloridos quando a barra é preta, e não obedecem ao tamanho
 * nem à cor do botão. Num terminal que fica doze horas ligado à frente do empregado,
 * isso lê-se como "software de brincadeira".
 *
 * Estes são traçados em SVG com `currentColor`: herdam a cor do botão, ficam nítidos em
 * qualquer tamanho, e têm o peso de linha do Windows — que é o que o dono pediu.
 */

type P = { size?: number; className?: string };

const Svg = ({ size = 30, className = '', children }: P & { children: any }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true">
    {children}
  </svg>
);

/** Lupa — pesquisar artigos */
export const IcoLupa = (p: P) => (
  <Svg {...p}><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></Svg>
);

/** Mais/menos — alterar a quantidade */
export const IcoMaisMenos = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="5.2" /><path d="M8 5.6v4.8M5.6 8h4.8" />
    <circle cx="16" cy="16" r="5.2" /><path d="M13.6 16h4.8" />
  </Svg>
);

/** Lápis — mensagens para a produção */
export const IcoLapis = (p: P) => (
  <Svg {...p}>
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0 0-3l-1-1a2.1 2.1 0 0 0-3 0L4 16v4Z" />
    <path d="M13.5 6.5 17.5 10.5" />
  </Svg>
);

/** Pessoa com + — quem leva a fatura */
export const IcoCliente = (p: P) => (
  <Svg {...p}>
    <circle cx="9.5" cy="7.5" r="3.5" />
    <path d="M3 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <path d="M18.5 8v6M15.5 11h6" />
  </Svg>
);

/** Caixote — anular a venda */
export const IcoLixo = (p: P) => (
  <Svg {...p}>
    <path d="M4 6.5h16" /><path d="M9.5 6.5V4.6c0-.6.5-1.1 1.1-1.1h2.8c.6 0 1.1.5 1.1 1.1v1.9" />
    <path d="M6.2 6.5 7 19.4c.05.9.8 1.6 1.7 1.6h6.6c.9 0 1.65-.7 1.7-1.6l.8-12.9" />
    <path d="M10 10.5v6M14 10.5v6" />
  </Svg>
);

/** Impressora — consulta de mesa / talão */
export const IcoImpressora = (p: P) => (
  <Svg {...p}>
    <path d="M7 9V3.8h10V9" />
    <path d="M7 17H5.2A2.2 2.2 0 0 1 3 14.8v-3.6A2.2 2.2 0 0 1 5.2 9h13.6A2.2 2.2 0 0 1 21 11.2v3.6a2.2 2.2 0 0 1-2.2 2.2H17" />
    <path d="M7 14h10v6.2H7z" />
  </Svg>
);

/** Moedas — pagamentos */
export const IcoDinheiro = (p: P) => (
  <Svg {...p}>
    <ellipse cx="12" cy="6.6" rx="7.6" ry="3.1" />
    <path d="M4.4 6.6v4.3c0 1.7 3.4 3.1 7.6 3.1s7.6-1.4 7.6-3.1V6.6" />
    <path d="M4.4 10.9v4.3c0 1.7 3.4 3.1 7.6 3.1s7.6-1.4 7.6-3.1v-4.3" />
  </Svg>
);

/** Visto — confirmar */
export const IcoVisto = (p: P) => (
  <Svg {...p} ><path d="M4 12.8 9.4 18.2 20 6.6" strokeWidth={2.6} /></Svg>
);

/** Cruz — fechar/cancelar */
export const IcoCruz = (p: P) => (
  <Svg {...p}><path d="M5.5 5.5 18.5 18.5M18.5 5.5 5.5 18.5" strokeWidth={2.4} /></Svg>
);

/** Roda dentada — o painel do terminal */
export const IcoEngrenagem = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.3 5.3l1.9 1.9M16.8 16.8l1.9 1.9M18.7 5.3l-1.9 1.9M7.2 16.8l-1.9 1.9" />
  </Svg>
);

/** Grelha — o mapa de mesas */
export const IcoMesas = (p: P) => (
  <Svg {...p}>
    <rect x="3.2" y="3.2" width="7" height="7" rx="1" />
    <rect x="13.8" y="3.2" width="7" height="7" rx="1" />
    <rect x="3.2" y="13.8" width="7" height="7" rx="1" />
    <rect x="13.8" y="13.8" width="7" height="7" rx="1" />
  </Svg>
);

/** Comanda — a venda */
export const IcoVenda = (p: P) => (
  <Svg {...p}>
    <path d="M5.5 3.2h13v17.6l-2.2-1.5-2.2 1.5-2.2-1.5-2.2 1.5-2.2-1.5-1.8 1.5Z" />
    <path d="M9 8h6M9 12h6" />
  </Svg>
);

/** Sino — produção pronta no passe */
export const IcoSino = (p: P) => (
  <Svg {...p}>
    <path d="M6 9.6a6 6 0 0 1 12 0c0 4.2 1.4 5.6 1.4 5.6H4.6S6 13.8 6 9.6Z" />
    <path d="M10.2 18.6a2 2 0 0 0 3.6 0" />
  </Svg>
);

/** Gaveta do dinheiro */
export const IcoGaveta = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="9.5" width="18" height="10" rx="1.6" />
    <path d="M5.4 9.5 7.2 4.6h9.6l1.8 4.9" /><path d="M9.6 14.4h4.8" />
  </Svg>
);

/** Documento */
export const IcoDocumento = (p: P) => (
  <Svg {...p}>
    <path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 16h6" />
  </Svg>
);

/** Lista — contas correntes */
export const IcoLista = (p: P) => (
  <Svg {...p}>
    <path d="M4 6.5h16M4 12h16M4 17.5h16" /><circle cx="19.4" cy="17.5" r="0.1" />
  </Svg>
);

/** Chave — alterar password */
export const IcoChave = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="13" r="4.2" />
    <path d="M11.4 10.6 20 4.5M17.4 6.6l1.8 1.8M15.2 8.2l1.8 1.8" />
  </Svg>
);

/** Setas circulares — atualizar */
export const IcoAtualizar = (p: P) => (
  <Svg {...p}>
    <path d="M20 11.4A8 8 0 1 0 18.4 16" /><path d="M20.4 5.6v5.4h-5.4" />
  </Svg>
);

/** Monitor — trocar de setor */
export const IcoEcra = (p: P) => (
  <Svg {...p}>
    <rect x="2.8" y="4" width="18.4" height="12.4" rx="1.6" />
    <path d="M8.6 20.2h6.8M12 16.4v3.8" />
  </Svg>
);

/** Saco a sair — sangria (cash pickup) */
export const IcoSangria = (p: P) => (
  <Svg {...p}>
    <path d="M4 9.5h9v10H4z" /><path d="M5.8 9.5 7.4 5h5.2l1.6 4.5" />
    <path d="M15.6 14.5H22M19.4 11.8l2.8 2.7-2.8 2.7" />
  </Svg>
);

/** Cadeado — fecho */
export const IcoCadeado = (p: P) => (
  <Svg {...p}>
    <rect x="4.6" y="10.4" width="14.8" height="10" rx="1.7" />
    <path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8" />
  </Svg>
);

/** Prancheta — detalhe da caixa */
export const IcoDetalhe = (p: P) => (
  <Svg {...p}>
    <rect x="4.5" y="4.2" width="15" height="16.6" rx="1.6" />
    <path d="M9 4.2V2.9h6v1.3" /><path d="M8.4 10h7.2M8.4 14h7.2M8.4 17.6h4" />
  </Svg>
);

/** Barras — resumo de vendas */
export const IcoGrafico = (p: P) => (
  <Svg {...p}>
    <path d="M3.6 20.4h16.8" /><path d="M7 20.4v-6.6M12 20.4V6.4M17 20.4v-10" strokeWidth={2.4} />
  </Svg>
);

/** Olho — visualizar preços */
export const IcoOlho = (p: P) => (
  <Svg {...p}>
    <path d="M2.4 12S6 5.6 12 5.6 21.6 12 21.6 12 18 18.4 12 18.4 2.4 12 2.4 12Z" />
    <circle cx="12" cy="12" r="2.9" />
  </Svg>
);

/** Camadas — ver artigos agrupados */
export const IcoAgrupar = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.2 21 8l-9 4.8L3 8Z" /><path d="M3 12.6 12 17.4l9-4.8" /><path d="M3 17l9 4.8 9-4.8" />
  </Svg>
);

/** Ramificação — funções parciais */
export const IcoParciais = (p: P) => (
  <Svg {...p}>
    <path d="M12 20.6V12" /><path d="M12 12 6.6 6.2M12 12l5.4-5.8" />
    <circle cx="6.6" cy="4.6" r="1.9" /><circle cx="17.4" cy="4.6" r="1.9" /><circle cx="12" cy="21" r="1.9" />
  </Svg>
);

/** Setas opostas — transferência de mesa */
export const IcoTransferir = (p: P) => (
  <Svg {...p}>
    <path d="M3.6 8.6h14M14.4 5.4l3.4 3.2-3.4 3.2" />
    <path d="M20.4 15.4H6.4M9.6 12.2l-3.4 3.2 3.4 3.2" />
  </Svg>
);

/** Percentagem — descontos */
export const IcoPercento = (p: P) => (
  <Svg {...p}>
    <path d="M5.6 18.4 18.4 5.6" strokeWidth={2.2} />
    <circle cx="7.6" cy="7.6" r="2.6" /><circle cx="16.4" cy="16.4" r="2.6" />
  </Svg>
);

/** Etiqueta de preço */
export const IcoPreco = (p: P) => (
  <Svg {...p}>
    <path d="M11.2 2.8H21v9.8l-9.4 9.4a1.7 1.7 0 0 1-2.4 0l-7-7a1.7 1.7 0 0 1 0-2.4Z" />
    <circle cx="17" cy="7" r="1.5" />
  </Svg>
);

/** Duas pessoas — número de clientes */
export const IcoPessoas = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="7.6" r="3.3" />
    <path d="M2.8 20c0-3.4 2.8-5.8 6.2-5.8s6.2 2.4 6.2 5.8" />
    <path d="M16.4 4.8a3.3 3.3 0 0 1 0 6.4M17.6 14.6c2.2.6 3.6 2.5 3.6 5.4" />
  </Svg>
);

/** Pausa — suspender conta */
export const IcoPausa = (p: P) => (
  <Svg {...p}><path d="M9.2 4.8v14.4M14.8 4.8v14.4" strokeWidth={2.6} /></Svg>
);

/** Cesto — combos/menus */
export const IcoCombo = (p: P) => (
  <Svg {...p}>
    <path d="M3.2 9.4h17.6l-1.7 9.5a2 2 0 0 1-2 1.7H6.9a2 2 0 0 1-2-1.7Z" />
    <path d="M8.4 9.4 10.6 3.4M15.6 9.4 13.4 3.4" />
  </Svg>
);

/** Campainha de serviço — destino/entregas */
export const IcoEntrega = (p: P) => (
  <Svg {...p}>
    <path d="M3.2 17.6h17.6" /><path d="M5 17.6a7 7 0 0 1 14 0" /><path d="M12 10.6V7.4" />
    <circle cx="12" cy="5.4" r="1.6" />
  </Svg>
);

/** Relógio com seta — histórico */
export const IcoHistorico = (p: P) => (
  <Svg {...p}>
    <path d="M3.4 12a8.6 8.6 0 1 0 2.6-6.1" /><path d="M3 4.2v4.6h4.6" /><path d="M12 7.8V12l3.2 2" />
  </Svg>
);

/** Cama — hóspedes */
export const IcoQuarto = (p: P) => (
  <Svg {...p}>
    <path d="M3 19.4v-11M3 12.6h18v6.8M21 19.4v-2.6" />
    <path d="M6.6 12.6V9.4h5.6v3.2" /><circle cx="16.2" cy="9.6" r="1.9" />
  </Svg>
);

/** Calendário — eventos/reservas */
export const IcoCalendario = (p: P) => (
  <Svg {...p}>
    <rect x="3.4" y="5" width="17.2" height="16" rx="1.7" />
    <path d="M3.4 9.8h17.2M8.2 3v4M15.8 3v4" />
  </Svg>
);

/** Proibido — sem conta / indisponível */
export const IcoProibido = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.6" /><path d="M6 6l12 12" /></Svg>
);

/** Borracha — limpar mensagem */
export const IcoLimpar = (p: P) => (
  <Svg {...p}>
    <path d="M8.4 20.4H20M3.9 16.2l4.5 4.2 10-10a1.9 1.9 0 0 0 0-2.7l-2.6-2.5a1.9 1.9 0 0 0-2.7 0l-9.2 9.2a1.9 1.9 0 0 0 0 1.8Z" />
  </Svg>
);

/** Teclado — abrir/fechar o teclado tátil */
export const IcoTeclado = (p: P) => (
  <Svg {...p}>
    <rect x="2.4" y="6" width="19.2" height="12" rx="1.8" />
    <path d="M6 9.4h.01M9.4 9.4h.01M12.8 9.4h.01M16.2 9.4h.01M6 12.8h.01M9.4 12.8h.01M12.8 12.8h.01M16.2 12.8h.01M18.6 9.4h.01M18.6 12.8h.01" />
    <path d="M7.6 15.6h8.8" />
  </Svg>
);

/** Triângulo de aviso — alergénios, avisos do terminal */
export const IcoAviso = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.6 22 20.4H2Z" /><path d="M12 9.8v4.6" /><circle cx="12" cy="17.4" r="0.6" fill="currentColor" />
  </Svg>
);

/** Seta para cima — maiúsculas no teclado tátil */
export const IcoMaiusculas = (p: P) => (
  <Svg {...p}><path d="M12 20V5.4" strokeWidth={2.4} /><path d="M5.6 11.8 12 5.4l6.4 6.4" strokeWidth={2.4} /></Svg>
);

/** Seta para trás */
export const IcoVoltar = (p: P) => (
  <Svg {...p}><path d="M20 12H4.6" strokeWidth={2.4} /><path d="M10.6 5.6 4.2 12l6.4 6.4" strokeWidth={2.4} /></Svg>
);
