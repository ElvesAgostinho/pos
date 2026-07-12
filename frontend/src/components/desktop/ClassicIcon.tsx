/**
 * Ícones clássicos (SVG desenhado à mão, estilo aplicação Windows — NÃO emoji, NÃO lucide).
 * Símbolo claro para assentar sobre a moldura 3D do ícone de desktop.
 * Se existir /public/icons/<name>.png (pack Vista/Crystal do cliente), o desktop usa-o.
 */
const S = 40;
const wrap = (children: any) => (
  <svg width={S} height={S} viewBox="0 0 48 48" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' }}>{children}</svg>
);
const F = '#ffffff', L = 'rgba(0,0,0,0.35)';

const ICONS: Record<string, any> = {
  rooms: wrap(<><rect x="12" y="8" width="24" height="32" rx="1.5" fill={F} stroke={L} strokeWidth="1.5" /><circle cx="30" cy="24" r="2.2" fill="#c9820a" /></>),
  reservations: wrap(<><rect x="8" y="12" width="32" height="28" rx="2" fill={F} stroke={L} strokeWidth="1.5" /><rect x="8" y="12" width="32" height="8" fill="#1e3f66" /><line x1="16" y1="8" x2="16" y2="16" stroke="#1e3f66" strokeWidth="2.5" strokeLinecap="round" /><line x1="32" y1="8" x2="32" y2="16" stroke="#1e3f66" strokeWidth="2.5" strokeLinecap="round" /><rect x="13" y="24" width="6" height="5" fill="#c0392b" /></>),
  bed: wrap(<><path d="M8 20 h32 a4 4 0 0 1 4 4 v12 h-4 v-4 H8 v4 H4 V16 h4 z" fill={F} stroke={L} strokeWidth="1.5" /><rect x="10" y="14" width="12" height="8" rx="2" fill="#4a86c5" /></>),
  people: wrap(<><circle cx="18" cy="18" r="6" fill={F} stroke={L} strokeWidth="1.3" /><circle cx="32" cy="20" r="5" fill="#cfe0f0" stroke={L} strokeWidth="1.3" /><path d="M6 40 c0-8 6-12 12-12 s12 4 12 12z" fill={F} stroke={L} strokeWidth="1.3" /><path d="M26 40 c0-6 5-10 10-10 s8 3 8 10z" fill="#cfe0f0" stroke={L} strokeWidth="1.3" /></>),
  broom: wrap(<><line x1="30" y1="10" x2="18" y2="28" stroke="#8a5a2b" strokeWidth="3" strokeLinecap="round" /><path d="M18 28 l10 6 l-4 8 c-6-1-10-5-10-10z" fill="#e0c060" stroke={L} strokeWidth="1.3" /></>),
  key: wrap(<><circle cx="16" cy="18" r="8" fill="none" stroke="#e0c060" strokeWidth="4" /><path d="M21 23 l16 16 M31 33 l4-4 M35 37 l4-4" stroke="#e0c060" strokeWidth="4" strokeLinecap="round" fill="none" /></>),
  chart: wrap(<><rect x="8" y="10" width="32" height="30" rx="2" fill={F} stroke={L} strokeWidth="1.5" /><rect x="13" y="26" width="5" height="9" fill="#2e7d32" /><rect x="21" y="20" width="5" height="15" fill="#1565c0" /><rect x="29" y="15" width="5" height="20" fill="#c0392b" /></>),
  moon: wrap(<path d="M32 8 a16 16 0 1 0 8 30 a13 13 0 0 1-8-30z" fill="#f0d878" stroke={L} strokeWidth="1.3" />),
  receipt: wrap(<><path d="M12 6 h24 v36 l-4-3 -4 3 -4-3 -4 3 -4-3 -4 3z" fill={F} stroke={L} strokeWidth="1.5" /><line x1="17" y1="15" x2="31" y2="15" stroke="#666" strokeWidth="2" /><line x1="17" y1="21" x2="31" y2="21" stroke="#666" strokeWidth="2" /><line x1="17" y1="27" x2="26" y2="27" stroke="#666" strokeWidth="2" /></>),
  money: wrap(<><rect x="6" y="14" width="36" height="22" rx="2" fill="#2e7d32" stroke={L} strokeWidth="1.5" /><circle cx="24" cy="25" r="6" fill="none" stroke={F} strokeWidth="2" /><text x="24" y="29" fontSize="9" fill={F} textAnchor="middle" fontWeight="bold">Kz</text></>),
  report: wrap(<><rect x="10" y="8" width="28" height="34" rx="2" fill={F} stroke={L} strokeWidth="1.5" /><path d="M15 30 l5-6 4 3 6-9" fill="none" stroke="#1565c0" strokeWidth="2.5" strokeLinecap="round" /><line x1="15" y1="15" x2="33" y2="15" stroke="#999" strokeWidth="2" /></>),
  folder: wrap(<path d="M6 12 h12 l4 4 h20 a2 2 0 0 1 2 2 v20 a2 2 0 0 1-2 2 H6 a2 2 0 0 1-2-2 V14 a2 2 0 0 1 2-2z" fill="#e0b23c" stroke={L} strokeWidth="1.3" />),
  globe: wrap(<><circle cx="24" cy="24" r="16" fill="#3a7fc0" stroke={L} strokeWidth="1.5" /><ellipse cx="24" cy="24" rx="7" ry="16" fill="none" stroke={F} strokeWidth="1.3" /><line x1="8" y1="24" x2="40" y2="24" stroke={F} strokeWidth="1.3" /><path d="M11 15 h26 M11 33 h26" stroke={F} strokeWidth="1" /></>),
  gear: wrap(<><circle cx="24" cy="24" r="8" fill="none" stroke={F} strokeWidth="4" /><g stroke={F} strokeWidth="4" strokeLinecap="round"><line x1="24" y1="6" x2="24" y2="12" /><line x1="24" y1="36" x2="24" y2="42" /><line x1="6" y1="24" x2="12" y2="24" /><line x1="36" y1="24" x2="42" y2="24" /><line x1="11" y1="11" x2="15" y2="15" /><line x1="33" y1="33" x2="37" y2="37" /><line x1="37" y1="11" x2="33" y2="15" /><line x1="15" y1="33" x2="11" y2="37" /></g></>),
  table: wrap(<><rect x="18" y="10" width="12" height="12" rx="2" fill="#c9820a" stroke={L} strokeWidth="1.3" /><rect x="8" y="26" width="10" height="10" rx="2" fill="#cfe0f0" stroke={L} strokeWidth="1.3" /><rect x="30" y="26" width="10" height="10" rx="2" fill="#cfe0f0" stroke={L} strokeWidth="1.3" /></>),
  kitchen: wrap(<><ellipse cx="24" cy="30" rx="15" ry="9" fill="#b0b0b0" stroke={L} strokeWidth="1.5" /><path d="M14 24 q10-10 20 0" fill="none" stroke={F} strokeWidth="2" /><line x1="9" y1="30" x2="4" y2="30" stroke="#888" strokeWidth="3" /><line x1="39" y1="30" x2="44" y2="30" stroke="#888" strokeWidth="3" /></>),
  cocktail: wrap(<><path d="M10 12 h28 l-14 16z" fill="#e08a2e" stroke={L} strokeWidth="1.5" /><line x1="24" y1="28" x2="24" y2="40" stroke="#888" strokeWidth="2.5" /><line x1="16" y1="40" x2="32" y2="40" stroke="#888" strokeWidth="3" strokeLinecap="round" /><circle cx="30" cy="15" r="2" fill="#c0392b" /></>),
  bell: wrap(<><path d="M24 8 a12 12 0 0 1 12 12 v10 l4 4 H8 l4-4 V20 A12 12 0 0 1 24 8z" fill="#e0c060" stroke={L} strokeWidth="1.5" /><circle cx="24" cy="38" r="3" fill="#e0c060" stroke={L} strokeWidth="1.3" /></>),
  delivery: wrap(<><rect x="4" y="16" width="22" height="14" rx="1" fill="#c0392b" stroke={L} strokeWidth="1.3" /><path d="M26 20 h8 l6 6 v4 H26z" fill="#e07a1a" stroke={L} strokeWidth="1.3" /><circle cx="12" cy="34" r="4" fill="#333" /><circle cx="34" cy="34" r="4" fill="#333" /></>),
  book: wrap(<><path d="M8 10 h14 a4 4 0 0 1 2 1 a4 4 0 0 1 2-1 h14 v28 h-14 a4 4 0 0 0-2 1 a4 4 0 0 0-2-1 H8z" fill={F} stroke={L} strokeWidth="1.5" /><line x1="24" y1="12" x2="24" y2="39" stroke="#bbb" strokeWidth="1.5" /></>),
  note: wrap(<><rect x="10" y="8" width="28" height="34" rx="2" fill={F} stroke={L} strokeWidth="1.5" /><line x1="15" y1="16" x2="33" y2="16" stroke="#999" strokeWidth="2" /><line x1="15" y1="23" x2="33" y2="23" stroke="#999" strokeWidth="2" /><line x1="15" y1="30" x2="27" y2="30" stroke="#999" strokeWidth="2" /></>),
  box: wrap(<><path d="M24 6 l18 8 v20 l-18 8 -18-8 V14z" fill="#c99a5b" stroke={L} strokeWidth="1.3" /><path d="M6 14 l18 8 18-8 M24 22 v20" fill="none" stroke={L} strokeWidth="1.3" /></>),
  cart: wrap(<><path d="M6 10 h6 l4 20 h20 l4-14 H16" fill="none" stroke={F} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="18" cy="38" r="3" fill={F} /><circle cx="34" cy="38" r="3" fill={F} /></>),
  card: wrap(<><rect x="6" y="12" width="36" height="24" rx="3" fill="#2b5797" stroke={L} strokeWidth="1.5" /><rect x="6" y="18" width="36" height="5" fill="#0d223a" /><rect x="11" y="28" width="12" height="4" rx="1" fill="#cfe0f0" /></>),
  cashbox: wrap(<><rect x="6" y="18" width="36" height="18" rx="2" fill="#2e7d32" stroke={L} strokeWidth="1.5" /><path d="M10 18 l6-8 h16 l6 8" fill="#3a9d4a" stroke={L} strokeWidth="1.3" /><rect x="20" y="24" width="8" height="4" fill={F} /></>),
  user: wrap(<><circle cx="24" cy="17" r="8" fill={F} stroke={L} strokeWidth="1.3" /><path d="M8 42 c0-10 8-15 16-15 s16 5 16 15z" fill={F} stroke={L} strokeWidth="1.3" /></>),
  product: wrap(<><rect x="10" y="12" width="28" height="28" rx="2" fill="#e07a1a" stroke={L} strokeWidth="1.5" /><rect x="10" y="12" width="28" height="8" fill="#c9820a" /><circle cx="24" cy="30" r="5" fill="none" stroke={F} strokeWidth="2" /></>),
  terminal: wrap(<><rect x="8" y="8" width="32" height="24" rx="2" fill="#111" stroke={L} strokeWidth="1.5" /><rect x="11" y="11" width="26" height="18" fill="#1f7a34" /><rect x="14" y="34" width="20" height="6" rx="1" fill="#555" /><line x1="16" y1="16" x2="28" y2="16" stroke="#7CFC98" strokeWidth="1.5" /></>),
};

export default function ClassicIcon({ name }: { name: string }) {
  return ICONS[name] || ICONS.note;
}
