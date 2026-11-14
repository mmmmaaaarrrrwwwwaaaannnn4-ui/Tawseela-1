import { memo } from 'react';
import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import * as Lucide from 'lucide-react-native';
import type { LucideProps } from 'lucide-react-native';

import { useTheme } from '@/theme/theme';

import type { IconName } from './glyphs';

export type { IconName };

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  /** Fill the icon where supported. */
  fill?: boolean | 0 | 1;
  style?: StyleProp<ViewStyle>;
}

/** Lucide outline icon adapter. Legacy names stay supported to avoid changing screen code. */
const ALIASES: Partial<Record<IconName, string>> = {
  add_a_photo: 'Camera',
  add_card: 'CreditCard',
  add_location_alt: 'MapPin',
  add_shopping_cart: 'ShoppingCart',
  arrow_back: 'ArrowLeft',
  arrow_back_ios_new: 'ChevronLeft',
  arrow_forward: 'ArrowRight',
  article: 'FileText',
  auto_stories: 'BookOpen',
  badge: 'BadgeCheck',
  block: 'Ban',
  bolt: 'Zap',
  calendar_month: 'CalendarDays',
  call: 'Phone',
  cancel: 'CircleX',
  category: 'Shapes',
  celebration: 'PartyPopper',
  chat: 'MessageCircle',
  check_circle: 'CircleCheck',
  contactless: 'Contactless',
  countertops: 'CookingPot',
  dark_mode: 'Moon',
  dashboard: 'LayoutDashboard',
  dashboard_customize: 'PanelsTopLeft',
  delete: 'Trash2',
  dinner_dining: 'Utensils',
  directions: 'Navigation',
  door_front: 'DoorOpen',
  eco: 'Leaf',
  edit: 'Pencil',
  edit_note: 'NotebookPen',
  edit_square: 'SquarePen',
  error: 'CircleAlert',
  event: 'CalendarDays',
  event_busy: 'CalendarX',
  event_seat: 'Armchair',
  expand_more: 'ChevronDown',
  favorite: 'Heart',
  front_hand: 'Hand',
  function: 'Sigma',
  group: 'Users',
  group_add: 'UserPlus',
  help: 'CircleHelp',
  home: 'House',
  inventory_2: 'Package',
  ios_share: 'Share',
  keyboard_arrow_down: 'ChevronDown',
  keyboard_arrow_up: 'ChevronUp',
  kitchen: 'CookingPot',
  label: 'Tag',
  language: 'Languages',
  light: 'Sun',
  light_mode: 'Sun',
  local_offer: 'Tag',
  local_pizza: 'Pizza',
  local_shipping: 'Truck',
  location_city: 'Building2',
  location_on: 'MapPin',
  lock_reset: 'KeyRound',
  login: 'LogIn',
  loyalty: 'Award',
  lunch_dining: 'Sandwich',
  menu_book: 'BookOpen',
  more: 'MoreHorizontal',
  more_horiz: 'MoreHorizontal',
  my_location: 'LocateFixed',
  notifications: 'Bell',
  orders: 'ClipboardList',
  password: 'KeyRound',
  payments: 'Wallet',
  person: 'User',
  person_remove: 'UserMinus',
  phone_iphone: 'Smartphone',
  photo_camera: 'Camera',
  post: 'FileText',
  public: 'Globe',
  ramen_dining: 'Soup',
  rate_review: 'MessageSquare',
  receipt_long: 'ReceiptText',
  redeem: 'Gift',
  remove: 'Minus',
  remove_shopping_cart: 'ShoppingCart',
  replay: 'RotateCcw',
  restaurant_menu: 'Utensils',
  room_service: 'ConciergeBell',
  schedule: 'Clock',
  search_off: 'SearchX',
  sell: 'Tag',
  send: 'Send',
  sentiment_dissatisfied: 'Frown',
  shield_lock: 'ShieldCheck',
  shopping_bag: 'ShoppingBag',
  signpost: 'Signpost',
  skillet: 'CookingPot',
  sms: 'MessageSquare',
  storefront: 'Store',
  support_agent: 'Headset',
  swap_horiz: 'ArrowLeftRight',
  sync: 'RefreshCw',
  table_restaurant: 'Table',
  thumb_down: 'ThumbsDown',
  thumb_up: 'ThumbsUp',
  tune: 'SlidersHorizontal',
  two_wheeler: 'Bike',
  undo: 'Undo2',
  verified: 'BadgeCheck',
  view_carousel: 'GalleryHorizontal',
  waving_hand: 'Hand',
  wine_bar: 'Wine',
  work: 'Briefcase',
  workspace_premium: 'Trophy',
};

function toPascalCase(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function IconBase({ name, size = 24, color, fill = false, style }: Props) {
  const { c } = useTheme();
  const iconName = ALIASES[name] ?? toPascalCase(name);
  const IconComponent = (Lucide as unknown as Record<string, ComponentType<LucideProps>>)[iconName]
    ?? Lucide.CircleHelp;

  return (
    <IconComponent
      size={size}
      color={color ?? c.text1}
      strokeWidth={2}
      fill={fill ? color ?? c.text1 : 'none'}
      style={style}
    />
  );
}

export const Icon = memo(IconBase);
