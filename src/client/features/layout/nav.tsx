/* Navigation model shared by the sidebar, the mobile bar and the "Menu" page. */

export const ICONS = {
  home: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10",
  book: "M4 19.5V6a2 2 0 012-2h12v15H6a2 2 0 00-2 2zm0 0A2 2 0 006 22h12",
  flask: "M9 3h6M10 3v6L4.5 18.5A2 2 0 006.2 21.5h11.6a2 2 0 001.7-3L14 9V3M7 15h10",
  menu: "M4 6h16M4 12h16M4 18h10",
  chef: "M6 13.9V20h12v-6.1A4 4 0 0017 6a5 5 0 00-10 0 4 4 0 00-1 7.9zM6 17h12",
  note: "M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h5",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.3-4.3",
  flame: "M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z",
  link: "M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2-1.2L14.5 2h-5l-.4 2.6a7.6 7.6 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 002 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  chat: "M21 12a8 8 0 01-11.6 7.1L4 20l1.1-4.6A8 8 0 1121 12zM8 10h8M8 14h5",
  repeat: "M4 12a8 8 0 0114-5.3L20 9M20 4v5h-5M20 12a8 8 0 01-14 5.3L4 15M4 20v-5h5",
  exam: "M9 5h6M9 3h6v4H9zM6 5H5a1 1 0 00-1 1v14a1 1 0 001 1h14a1 1 0 001-1V6a1 1 0 00-1-1h-1M8 13l2 2 4-4",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 018 0v4M12 15v2",
  users: "M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M9 10a3 3 0 100-6 3 3 0 000 6zM22 19v-1a4 4 0 00-3-3.9M16 4.1a3 3 0 010 5.8",
  pot: "M4 10h16v6a4 4 0 01-4 4H8a4 4 0 01-4-4zM2 10h2M20 10h2M9 6c0-1 1-1 1-2M14 6c0-1 1-1 1-2",
  cart: "M3 4h2l2.4 11h10.2L20 8H6.2M9 20a1 1 0 100-2 1 1 0 000 2zM17 20a1 1 0 100-2 1 1 0 000 2z",
  truck: "M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z",
  handover: "M9 5h6M9 3h6v4H9zM6 5H5a1 1 0 00-1 1v14a1 1 0 001 1h14a1 1 0 001-1V6a1 1 0 00-1-1h-1M8 12h8M8 16h5",
  thermo: "M14 14.8V5a2 2 0 10-4 0v9.8a4 4 0 104 0zM12 17v-5",
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`${className} shrink-0`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  );
}

export type Tone = "kitchen" | "learn" | "know" | "mine" | "account";
/** Icon chip colours per section — readable in light and dark themes. */
export const TONE: Record<Tone, string> = {
  kitchen: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  learn: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  know: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  mine: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  account: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Only for owner / admin / trainer. */
  staff?: boolean;
  hint?: string;
}
export interface NavGroup {
  key: string;
  label: string;
  tone: Tone;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "kitchen",
    label: "Kuchnia",
    tone: "kitchen",
    items: [
      { to: "/kuchnia/zakupy", label: "Lista zakupów", icon: "cart", hint: "Co dokupić" },
      { to: "/kuchnia/hurtownia", label: "Hurtownia", icon: "truck", hint: "Zamówienie wg stanów" },
      { to: "/kuchnia/zmiana", label: "Przekazanie zmiany", icon: "handover", hint: "Protokół zmiany" },
      { to: "/kuchnia/haccp", label: "HACCP", icon: "thermo", hint: "Temperatury i szkodniki" },
    ],
  },
  {
    key: "learn",
    label: "Nauka",
    tone: "learn",
    items: [
      { to: "/akademia", label: "Akademia", icon: "book", hint: "Lekcje i ćwiczenia" },
      { to: "/powtorki", label: "Powtórki", icon: "repeat", hint: "Codzienne utrwalanie" },
      { to: "/egzaminy", label: "Egzaminy", icon: "exam", hint: "Sprawdź poziom" },
      { to: "/postepy", label: "Postępy", icon: "chart", hint: "Kompetencje" },
    ],
  },
  {
    key: "know",
    label: "Wiedza",
    tone: "know",
    items: [
      { to: "/karta", label: "Karta KOKU", icon: "menu", hint: "Pozycje menu" },
      { to: "/skladniki", label: "Składniki", icon: "flask", hint: "Laboratorium" },
      { to: "/techniki", label: "Techniki", icon: "flame", hint: "Procesy" },
      { to: "/receptury", label: "Receptury", icon: "chef", hint: "Twoje receptury" },
      { to: "/zrodla", label: "Źródła", icon: "link", hint: "Skąd wiemy" },
    ],
  },
  {
    key: "mine",
    label: "Moje",
    tone: "mine",
    items: [
      { to: "/notatnik", label: "Notatnik", icon: "note", hint: "Notatki prywatne" },
      { to: "/sejf", label: "Sejf", icon: "lock", hint: "Szyfrowane" },
    ],
  },
  {
    key: "account",
    label: "Konto",
    tone: "account",
    items: [
      { to: "/zespol", label: "Zespół", icon: "users", staff: true, hint: "Osoby i lokale" },
      { to: "/ustawienia", label: "Ustawienia", icon: "gear", hint: "Profil, motyw, passkey" },
    ],
  },
];

export const MOBILE_NAV: NavItem[] = [
  { to: "/", label: "Pulpit", icon: "home" },
  { to: "/kuchnia", label: "Kuchnia", icon: "pot" },
  { to: "/akademia", label: "Nauka", icon: "book" },
  { to: "/powtorki", label: "Powtórki", icon: "repeat" },
  { to: "/wiecej", label: "Menu", icon: "grid" },
];

export function isActive(pathname: string, to: string): boolean {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");
}
