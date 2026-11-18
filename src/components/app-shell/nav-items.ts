import { ChartColumn, Disc3, Heart, PlusCircle, Settings, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
  /** Other path prefixes that highlight this item. */
  also?: string[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/library", label: "Library", icon: Disc3, also: ["/album", "/copy"] },
  { href: "/wishlist", label: "Wishlist", icon: Heart },
  { href: "/add", label: "Add", icon: PlusCircle, primary: true, also: ["/scan"] },
  { href: "/stats", label: "Stats", icon: ChartColumn },
  { href: "/settings", label: "Settings", icon: Settings },
];
