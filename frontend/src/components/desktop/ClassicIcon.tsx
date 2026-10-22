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

import { ICONES_3D } from '../ui/Icon3D';

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

export default function ClassicIcon({ name, size = 26, cor }: { name: string; size?: number; cor?: string }) {
  // ÍCONE 3D PRIMEIRO. No Ambiente de Trabalho o ícone não acompanha texto — é
  // o elemento, e é por ele que se escolhe onde entrar. Aí vale a pena ter
  // volume (ver Icon3D.tsx). Para os nomes que ainda não têm versão 3D, volta
  // ao traço, que continua a ser melhor do que um desenho a menos.
  const Tridimensional = ICONES_3D[name?.toLowerCase?.()];
  if (Tridimensional) return <Tridimensional size={Math.round(size * 1.5)} cor={cor} />;
  const Icon = ICONS[name] || StickyNote;
  return <Icon size={size} strokeWidth={1.75} />;
}
