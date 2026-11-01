/**
 * O ÍCONE DO AMBIENTE DE TRABALHO — uma porta só, dois sítios onde procurar.
 *
 * 1.º o conjunto no registo do Windows (IconesWindows.tsx): cor por objecto,
 *    faces lisas, sem verniz nem sombra pousada. É o que se vê no ambiente de
 *    trabalho e nos mosaicos do menu Iniciar, onde o ícone É o elemento.
 *
 * 2.º para um nome que ainda não tenha desenho próprio, o traço fino do lucide,
 *    que é a biblioteca que o resto do sistema usa. Um ícone a menos lê-se pior
 *    do que um ícone de outra família — mas lê-se.
 *
 * Antes daqui passavam os ícones 3D isométricos (Icon3D.tsx, apagado): objecto
 * em perspectiva, numa cor só, com brilho de verniz e sombra oval. Liam como
 * ícones de loja de aplicações; o pedido do dono foi o registo do Windows,
 * sério, e é outra linguagem — ver o cabeçalho de IconesWindows.tsx.
 *
 * `cor` já não faz nada e fica por compatibilidade: estes ícones têm a cor do
 * OBJECTO (a pasta é âmbar, o ecrã é aço), e tingi-los todos da cor da marca
 * era voltar a ter vinte manchas iguais. Quem chama continua a poder passá-la
 * sem erro — é só ignorada.
 */
import {
  BedDouble, CalendarCheck, KeyRound, BarChart3, Wallet, FileBarChart2, Folder, Globe2,
  Settings2, UtensilsCrossed, ChefHat, Wine, Bell, Truck, BookOpen, StickyNote, Package,
  ShoppingCart, CreditCard, Landmark, User, Tag, MonitorSmartphone, Moon, Sparkles, Users,
} from 'lucide-react';

import { ICONES_WINDOWS } from './IconesWindows';

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

export default function ClassicIcon({ name, size = 26 }: { name: string; size?: number; cor?: string }) {
  const Windows = ICONES_WINDOWS[name?.toLowerCase?.()];
  if (Windows) return <Windows size={size} />;
  const Icon = ICONS[name] || StickyNote;
  return <Icon size={size} strokeWidth={1.75} />;
}
