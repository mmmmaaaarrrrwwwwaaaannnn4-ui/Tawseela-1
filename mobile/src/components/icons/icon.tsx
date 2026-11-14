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
  /** Retained for compatibility with existing call sites. */
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
  add: 'Plus', add_a_photo: 'Camera', add_card: 'CreditCard', add_location_alt: 'MapPin',
  add_shopping_cart: 'ShoppingCart', apartment: 'Building2', arrow_back: 'ArrowLeft',
  arrow_back_ios_new: 'ChevronLeft', arrow_forward: 'ArrowRight', article: 'FileText',
  auto_stories: 'BookOpen', badge: 'BadgeCheck', block: 'Ban', bolt: 'Zap', cake: 'Cake',
  calendar_month: 'CalendarDays', call: 'Phone', cancel: 'XCircle', category: 'Shapes',
  celebration: 'PartyPopper', chat: 'MessageCircle', check: 'Check', check_circle: 'CheckCircle',
  chevron_right: 'ChevronRight', close: 'X', contactless: 'CreditCard', content_copy: 'Copy',
  countertops: 'CookingPot', credit_card: 'CreditCard', dark_mode: 'Moon', dashboard: 'LayoutDashboard',
  dashboard_customize: 'PanelsTopLeft', deck: 'Armchair', delete: 'Trash2', dinner_dining: 'Utensils',
  directions: 'Navigation', door_front: 'DoorOpen', download: 'Download', eco: 'Leaf', edit: 'Pencil',
  edit_note: 'FilePenLine', edit_square: 'SquarePen', error: 'AlertCircle', event: 'Calendar',
  event_busy: 'CalendarX', event_seat: 'Armchair', expand_more: 'ChevronDown', favorite: 'Heart',
  front_hand: 'Hand', group: 'Users', group_add: 'UserPlus', help: 'CircleHelp', history: 'History',
  home: 'House', inbox: 'Inbox', info: 'Info', inventory_2: 'Package', ios_share: 'Share',
  keyboard_arrow_down: 'ChevronDown', keyboard_arrow_up: 'ChevronUp', kitchen: 'ChefHat',
  language: 'Languages', light: 'Sun', light_mode: 'Sun', link: 'Link', local_offer: 'Tag',
  local_pizza: 'Pizza', local_shipping: 'Truck', location_city: 'Building2', location_on: 'MapPin',
  lock: 'Lock', lock_open: 'LockOpen', lock_reset: 'KeyRound', login: 'LogIn', loyalty: 'Award',
  lunch_dining: 'Sandwich', mail: 'Mail', menu: 'Menu', menu_book: 'BookOpen', more: 'Ellipsis',
  more_horiz: 'Ellipsis', my_location: 'LocateFixed', notifications: 'Bell', orders: 'ShoppingBag',
  password: 'KeyRound', payments: 'CreditCard', person: 'User', person_remove: 'UserMinus',
  phone_iphone: 'Smartphone', photo_camera: 'Camera', pin: 'MapPin', post: 'FileText',
  public: 'Globe', ramen_dining: 'Soup', rate_review: 'MessageSquareText', receipt_long: 'ReceiptText',
  redeem: 'Gift', remove: 'Minus', remove_shopping_cart: 'ShoppingCart', replay: 'RotateCcw',
  reply: 'Reply', report: 'Flag', restaurant_menu: 'Utensils', reviews: 'Star', room_service: 'ConciergeBell',
  schedule: 'Clock', search: 'Search', search_off: 'SearchX', sell: 'Tag', send: 'Send',
  sentiment_dissatisfied: 'Frown', settings: 'Settings', shield_lock: 'ShieldCheck',
  shopping_bag: 'ShoppingBag', signpost: 'Signpost', skillet: 'CookingPot', sms: 'MessageSquare',
  star: 'Star', storefront: 'Store', support_agent: 'Headset', swap_horiz: 'ArrowLeftRight',
  sync: 'RefreshCw', table_restaurant: 'Table', thumb_down: 'ThumbsDown', thumb_up: 'ThumbsUp',
  timer: 'Timer', tune: 'SlidersHorizontal', two_wheeler: 'Bike', undo: 'Undo2',
  verified: 'BadgeCheck', view_carousel: 'GalleryHorizontal', waving_hand: 'Hand',
  wine_bar: 'Wine', work: 'Briefcase', workspace_premium: 'Trophy',
};

function resolveIcon(name: IconName): NativeIcon {
  const mapped = ICON_ALIASES[name] ?? name.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  const candidate = (Lucide as unknown as Record<string, unknown>)[mapped];
  return (typeof candidate === 'function' ? candidate : Lucide.CircleHelp) as NativeIcon;
}

/** Lucide outline icons with a consistent rounded stroke across the app. */
function IconBase({ name, size = 24, color, fill = false, style }: Props) {
  const { c } = useTheme();
  const Glyph = resolveIcon(name);
  const tint = color ?? c.text1;
  return (
    <Glyph
      size={size}
      color={tint}
      strokeWidth={2.15}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={fill ? tint : 'none'}
      {...(style ? { style } : {})}
    />
  );
}

export const Icon = memo(IconBase);
