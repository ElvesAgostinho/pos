/**
 * OS ÍCONES DO TERMINAL — biblioteca profissional (lucide-react), não emoji nem
 * traço caseiro.
 *
 * Os emoji (🔍 🗑 💰) são desenhados pelo SISTEMA: mudam de forma entre o Windows, o
 * Android e o iPhone, vêm coloridos quando a barra é preta, e não obedecem ao tamanho
 * nem à cor do botão. Num terminal que fica doze horas ligado à frente do empregado,
 * isso lê-se como "software de brincadeira".
 *
 * A primeira versão traçava SVGs à mão — mais sóbrio que emoji, mas ainda assim fino
 * e amador ao lado de um traço desenhado por profissionais. Estes exportam os MESMOS
 * nomes (IcoLupa, IcoVisto…) mas por dentro usam o traço da lucide-react, já usada no
 * resto do sistema (login, ambiente de trabalho) — um só desenhador para o ecrã todo.
 */
import {
  Search, CirclePlus, CircleMinus, Pencil, UserPlus, Trash2, Printer, Coins, Check, X,
  Settings, LayoutGrid, ReceiptText, Bell, Vault, FileText, List, Key, RefreshCw, Monitor,
  HandCoins, Lock, ClipboardList, BarChart3, Eye, Layers, GitBranch, ArrowLeftRight, Percent,
  Tag, Users, Pause, ShoppingBasket, Truck, History, BedSingle, Calendar, Ban, Eraser,
  Keyboard, TriangleAlert, ChevronUp, ArrowLeft,
} from 'lucide-react';

type P = { size?: number; className?: string };

/** Lupa — pesquisar artigos */
export const IcoLupa = (p: P) => <Search {...p} strokeWidth={2.2} />;

/** +/− — alterar a quantidade */
export const IcoMaisMenos = ({ size = 30, className = '' }: P) => (
  <span className={`inline-flex items-center ${className}`} style={{ width: size, height: size }}>
    <CirclePlus size={size * 0.62} strokeWidth={2.2} />
    <CircleMinus size={size * 0.62} strokeWidth={2.2} style={{ marginLeft: -size * 0.08 }} />
  </span>
);

/** Lápis — mensagens para a produção */
export const IcoLapis = (p: P) => <Pencil {...p} strokeWidth={2.2} />;

/** Pessoa com + — quem leva a fatura */
export const IcoCliente = (p: P) => <UserPlus {...p} strokeWidth={2.2} />;

/** Caixote — anular a venda */
export const IcoLixo = (p: P) => <Trash2 {...p} strokeWidth={2.2} />;

/** Impressora — consulta de mesa / talão */
export const IcoImpressora = (p: P) => <Printer {...p} strokeWidth={2.2} />;

/** Moedas — pagamentos */
export const IcoDinheiro = (p: P) => <Coins {...p} strokeWidth={2.2} />;

/** Visto — confirmar. GROSSO de propósito: é o botão mais tocado do terminal, tem
    de se ver bem ao centro mesmo num ecrã ao sol ou visto de lado. */
export const IcoVisto = (p: P) => <Check {...p} strokeWidth={3.6} />;

/** Cruz — fechar/cancelar */
export const IcoCruz = (p: P) => <X {...p} strokeWidth={2.8} />;

/** Roda dentada — o painel do terminal */
export const IcoEngrenagem = (p: P) => <Settings {...p} strokeWidth={2.1} />;

/** Grelha — o mapa de mesas */
export const IcoMesas = (p: P) => <LayoutGrid {...p} strokeWidth={2.1} />;

/** Comanda — a venda */
export const IcoVenda = (p: P) => <ReceiptText {...p} strokeWidth={2.1} />;

/** Sino — produção pronta no passe */
export const IcoSino = (p: P) => <Bell {...p} strokeWidth={2.2} />;

/** Cofre — gaveta do dinheiro */
export const IcoGaveta = (p: P) => <Vault {...p} strokeWidth={2.1} />;

/** Documento */
export const IcoDocumento = (p: P) => <FileText {...p} strokeWidth={2.1} />;

/** Lista — contas correntes */
export const IcoLista = (p: P) => <List {...p} strokeWidth={2.2} />;

/** Chave — alterar password */
export const IcoChave = (p: P) => <Key {...p} strokeWidth={2.2} />;

/** Setas circulares — atualizar */
export const IcoAtualizar = (p: P) => <RefreshCw {...p} strokeWidth={2.2} />;

/** Monitor — trocar de setor */
export const IcoEcra = (p: P) => <Monitor {...p} strokeWidth={2.1} />;

/** Mão com moedas — sangria (cash pickup) */
export const IcoSangria = (p: P) => <HandCoins {...p} strokeWidth={2.1} />;

/** Cadeado — fecho */
export const IcoCadeado = (p: P) => <Lock {...p} strokeWidth={2.2} />;

/** Prancheta — detalhe da caixa */
export const IcoDetalhe = (p: P) => <ClipboardList {...p} strokeWidth={2.1} />;

/** Barras — resumo de vendas */
export const IcoGrafico = (p: P) => <BarChart3 {...p} strokeWidth={2.2} />;

/** Olho — visualizar preços */
export const IcoOlho = (p: P) => <Eye {...p} strokeWidth={2.1} />;

/** Camadas — ver artigos agrupados */
export const IcoAgrupar = (p: P) => <Layers {...p} strokeWidth={2.1} />;

/** Ramificação — funções parciais */
export const IcoParciais = (p: P) => <GitBranch {...p} strokeWidth={2.1} />;

/** Setas opostas — transferência de mesa */
export const IcoTransferir = (p: P) => <ArrowLeftRight {...p} strokeWidth={2.2} />;

/** Percentagem — descontos */
export const IcoPercento = (p: P) => <Percent {...p} strokeWidth={2.2} />;

/** Etiqueta de preço */
export const IcoPreco = (p: P) => <Tag {...p} strokeWidth={2.1} />;

/** Duas pessoas — número de clientes */
export const IcoPessoas = (p: P) => <Users {...p} strokeWidth={2.1} />;

/** Pausa — suspender conta */
export const IcoPausa = (p: P) => <Pause {...p} strokeWidth={2.4} />;

/** Cesto — combos/menus */
export const IcoCombo = (p: P) => <ShoppingBasket {...p} strokeWidth={2.1} />;

/** Camião — destino/entregas */
export const IcoEntrega = (p: P) => <Truck {...p} strokeWidth={2.1} />;

/** Relógio com seta — histórico */
export const IcoHistorico = (p: P) => <History {...p} strokeWidth={2.1} />;

/** Cama — hóspedes */
export const IcoQuarto = (p: P) => <BedSingle {...p} strokeWidth={2.1} />;

/** Calendário — eventos/reservas */
export const IcoCalendario = (p: P) => <Calendar {...p} strokeWidth={2.1} />;

/** Proibido — sem conta / indisponível */
export const IcoProibido = (p: P) => <Ban {...p} strokeWidth={2.1} />;

/** Borracha — limpar mensagem */
export const IcoLimpar = (p: P) => <Eraser {...p} strokeWidth={2.1} />;

/** Teclado — abrir/fechar o teclado tátil */
export const IcoTeclado = (p: P) => <Keyboard {...p} strokeWidth={2.1} />;

/** Triângulo de aviso — alergénios, avisos do terminal */
export const IcoAviso = (p: P) => <TriangleAlert {...p} strokeWidth={2.2} />;

/** Seta para cima — maiúsculas no teclado tátil */
export const IcoMaiusculas = (p: P) => <ChevronUp {...p} strokeWidth={2.6} />;

/** Seta para trás */
export const IcoVoltar = (p: P) => <ArrowLeft {...p} strokeWidth={2.6} />;
