/**
 * Ícones do Ambiente de Trabalho — traço fino lucide-react, a MESMA biblioteca já usada
 * em todo o resto do sistema (grelhas, botões, barras). Antes eram SVGs desenhados à mão
 * em estilo "Windows XP realista" (garrafas, vassouras, "Kz" escrito à mão) — inconsistentes
 * entre si e com o resto da app. Um mapa nome->ícone é mais fácil de manter e cresce sozinho
 * ao acrescentar um workspace novo (basta um caso no mapa, não desenhar um SVG).
 */
import {
  BedDouble, CalendarCheck, KeyRound, BarChart3, Wallet, FileBarChart2, Folder, Globe2,
  Settings2, UtensilsCrossed, ChefHat, Wine, Bell, Truck, BookOpen, StickyNote, Package,
  ShoppingCart, CreditCard, Landmark, User, Tag, MonitorSmartphone, Moon, Sparkles, Users,
} from 'lucide-react';

const ICONS: Record<string, any> = {
  rooms: BedDouble, bed: BedDouble,
  reservations: CalendarCheck,
  key: KeyRound,
  chart: BarChart3,
  money: Wallet, cashbox: Landmark,
  report: FileBarChart2,
  folder: Folder,
  globe: Globe2,
  gear: Settings2,
  table: UtensilsCrossed,
  kitchen: ChefHat,
  cocktail: Wine,
  bell: Bell,
  delivery: Truck,
  book: BookOpen,
  note: StickyNote,
  box: Package,
  cart: ShoppingCart,
  card: CreditCard,
  user: User, people: Users,
  product: Tag,
  terminal: MonitorSmartphone,
  moon: Moon,
  broom: Sparkles,
};

export default function ClassicIcon({ name, size = 26 }: { name: string; size?: number }) {
  const Icon = ICONS[name] || StickyNote;
  return <Icon size={size} strokeWidth={1.75} />;
}
