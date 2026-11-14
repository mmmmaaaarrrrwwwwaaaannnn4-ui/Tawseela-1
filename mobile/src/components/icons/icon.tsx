import { memo } from 'react';
import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import * as Lucide from 'lucide-react-native';

import { useTheme } from '@/theme/theme';
import type { IconName } from './glyphs';

export type { IconName };

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  fill?: boolean | 0 | 1;
  style?: StyleProp<ViewStyle>;
}

type NativeIcon = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
  strokeLinecap?: 'round' | 'butt' | 'square';
  strokeLinejoin?: 'round' | 'miter' | 'bevel';
  fill?: string;
  style?: StyleProp<ViewStyle>;
}>;

const ICON_ALIASES: Partial<Record<IconName, keyof typeof Lucide>> = {
  add: 'Plus',
  add_a_photo: 'Camera',
  add_card: 'CreditCard',
  add_location_alt: 'MapPin',
  add_shopping_cart: 'ShoppingCart',
  apartment: 'Building2',
  arrow_back: 'ArrowLeft',
  arrow_back_ios_new: 'ChevronLeft',
  arrow_forward: 'ArrowRight',
  article: 'FileText',
  auto_stories: 'BookOpen',
  badge: 'Award',
  block: 'XCircle',
  bolt: 'Zap',
  cake: 'Cake',
  calendar_month: 'CalendarDays',
  call: 'Phone',
  cancel: 'XCircle',
  category: 'Grid',
  celebration: 'PartyPopper',
  chat: 'MessageCircle',
  check: 'Check',
  check_circle: 'CheckCircle',
  chevron_right: 'ChevronRight',
  close: 'X',
  contactless: 'CreditCard',
  content_copy: 'Copy',
  countertops: 'ChefHat',
  credit_card: 'CreditCard',
  dark_mode: 'Moon',
  dashboard: 'LayoutDashboard',
  dashboard_customize: 'LayoutDashboard',
  deck: 'Armchair',
  delete: 'Trash2',
  dinner_dining: 'Utensils',
  directions: 'Navigation',
  door_front: 'LogIn',
  download: 'Download',
  eco: 'Sprout',
  edit: 'Pencil',
  edit_note: 'Pencil',
  edit_square: 'Pencil',
  error: 'AlertCircle',
  event: 'Calendar',
  event_busy: 'CalendarX',
  event_seat: 'Armchair',
  expand_more: 'ChevronDown',
  favorite: 'Heart',
  front_hand: 'Hand',
  function: 'FunctionSquare',
  group: 'Users',
  group_add: 'UserPlus',
  help: 'HelpCircle',
  history: 'History',
  home: 'Home',
  inbox: 'Inbox',
  info: 'Info',
  inventory_2: 'Package',
  ios_share: 'Share',
  keyboard_arrow_down: 'ChevronDown',
  keyboard_arrow_up: 'ChevronUp',
  kitchen: 'ChefHat',
  label: 'Tag',
  language: 'Languages',
  light: 'Sun',
  light_mode: 'Sun',
  link: 'Link',
  local_offer: 'Tag',
  local_pizza: 'Pizza',
  local_shipping: 'Truck',
  location_city: 'Building2',
  location_on: 'MapPin',
  lock: 'Lock',
  lock_open: 'Unlock',
  lock_reset: 'Key',
  login: 'LogIn',
  loyalty: 'Award',
  lunch_dining: 'Utensils',
  mail: 'Mail',
  menu: 'Menu',
  menu_book: 'BookOpen',
  more: 'MoreHorizontal',
  more_horiz: 'MoreHorizontal',
  my_location: 'LocateFixed',
  notifications: 'Bell',
  orders: 'ShoppingBag',
  password: 'Key',
  payments: 'Wallet',
  person: 'User',
  person_remove: 'UserMinus',
  phone_iphone: 'Smartphone',
  photo_camera: 'Camera',
  pin: 'MapPin',
  post: 'FileText',
  public: 'Globe',
  ramen_dining: 'ChefHat',
  rate_review: 'MessageSquare',
  receipt_long: 'FileText',
  redeem: 'Gift',
  remove: 'Minus',
  remove_shopping_cart: 'ShoppingCart',
  replay: 'RotateCcw',
  reply: 'Reply',
  report: 'Flag',
  restaurant_menu: 'Utensils',
  reviews: 'Star',
  room_service: 'ConciergeBell',
  schedule: 'Clock',
  search: 'Search',
  search_off: 'Search',
  sell: 'Tag',
  send: 'Send',
  sentiment_dissatisfied: 'Frown',
  settings: 'Settings',
  shield_lock: 'ShieldCheck',
  shopping_bag: 'ShoppingBag',
  signpost: 'MapPin',
  skillet: 'ChefHat',
  sms: 'MessageSquare',
  star: 'Star',
  storefront: 'ShoppingBag',
  support_agent: 'Headphones',
  swap_horiz: 'ArrowLeftRight',
  sync: 'RefreshCw',
  table_restaurant: 'Table',
  thumb_down: 'ThumbsDown',
  thumb_up: 'ThumbsUp',
  timer: 'Timer',
  tune: 'SlidersHorizontal',
  two_wheeler: 'Bike',
  undo: 'Undo2',
  verified: 'ShieldCheck',
  view_carousel: 'Image',
  waving_hand: 'Hand',
  wine_bar: 'Wine',
  work: 'Briefcase',
  workspace_premium: 'Trophy',
};

function resolveIcon(name: IconName): NativeIcon {
  const key = ICON_ALIASES[name] ?? name.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  const exports = Lucide as unknown as Record<string, unknown>;
  const Glyph = exports[key];

  // Lucide React Native exports forwardRef components, which are objects at
  // runtime (not functions). Accept both component shapes instead of hiding them.
  if (typeof Glyph === 'function' || (typeof Glyph === 'object' && Glyph !== null)) {
    return Glyph as NativeIcon;
  }

  // Keep every legacy icon slot visible if a future package release renames an export.
  return Lucide.HelpCircle as NativeIcon;
}

function IconBase({ name, size = 24, color, fill = false, style }: Props) {
  const { c } = useTheme();
  const Glyph = resolveIcon(name);
  const tint = color ?? c.text1;
  return (
    <Glyph
      size={size}
      color={tint}
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={fill ? tint : 'none'}
      {...(style ? { style } : {})}
    />
  );
}

export const Icon = memo(IconBase);