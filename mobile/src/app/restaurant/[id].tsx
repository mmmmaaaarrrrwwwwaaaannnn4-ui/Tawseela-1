import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icons/icon';
import { CircleButton, AccentFill } from '@/components/ui/buttons';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { useStatusBar } from '@/hooks/use-status-bar';
import { useApp } from '@/store/app-store';
import { useTheme } from '@/theme/theme';

export default function RestaurantScreen() {
  useStatusBar();
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useApp((s) => s.brands.find((item) => item.id === id));
  const dishes = useApp((s) => s.menu.filter((item) => item.brand === id && item.avail));
  if (!brand) {
    return (
      <View style={[styles.empty, { backgroundColor: c.bg }]}>
        <Txt s={18} w={700}>المطعم غير متاح</Txt>
        <PressableScale onPress={() => router.back()} style={[styles.cta, { backgroundColor: c.accent }]}><Txt color="#FFFFFF" w={700}>رجوع</Txt></PressableScale>
      </View>
    );
  }
  const openMenu = () => {
    useApp.getState().setMenuCat('All', brand.id);
    router.push('/menu' as never);
  };
  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={styles.hero}>
          <Image source={{ uri: brand.img }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.heroTop}>
            <CircleButton icon="arrow_back_ios_new" size={42} iconSize={21} variant="soft" label="رجوع" onPress={() => router.back()} />
          </View>
          <View style={styles.heroShade} />
        </View>
        <View style={styles.body}>
          <Txt s={27} w={700}>{brand.name}</Txt>
          <Txt s={14} color={c.text2}>{brand.tag}</Txt>
          {brand.description ? <Txt s={14} color={c.text2} style={{ lineHeight: 23 }}>{brand.description}</Txt> : null}
          <View style={[styles.info, { backgroundColor: c.surface1, borderColor: c.line }]}>
            <View style={styles.infoRow}>
              <Icon name="location_on" size={20} color={c.accent} />
              <View style={{ flex: 1 }}>
                <Txt s={14} w={600} align="right">{brand.address || 'عنوان المطعم غير متاح'}</Txt>
              </View>
            </View>
            <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12 }]}>
              <Icon name="schedule" size={20} color={c.accent} />
              <View style={{ flex: 1 }}>
                <Txt s={14} w={600} align="right">{brand.openTime} – {brand.closeTime}</Txt>
              </View>
            </View>
            {brand.phone ? <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12 }]}><Icon name="call" size={20} color={c.accent} /><View style={{ flex: 1 }}><Txt s={14} w={600} align="right">{brand.phone}</Txt></View></View> : null}
          </View>
          <View style={styles.menuHeading}>
            <Txt s={19} w={700}>قائمة المطعم</Txt>
            <Txt s={13} color={c.text3}>{dishes.length} صنف متاح</Txt>
          </View>
          {dishes.slice(0, 4).map((dish) => (
            <View key={dish.id} style={[styles.dish, { borderBottomColor: c.line }]}>
              <Image source={{ uri: dish.img }} style={styles.dishImage} contentFit="cover" />
              <View style={{ flex: 1, gap: 4 }}>
                <Txt s={14} w={600} align="right">{dish.name}</Txt>
                <Txt s={12} color={c.text3} align="right" numberOfLines={2}>{dish.desc}</Txt>
              </View>
              <Txt s={13} w={700} color={c.accent}>{dish.price} ج.م</Txt>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={[styles.footer, { backgroundColor: c.bg, borderTopColor: c.line }]}>
        <PressableScale onPress={openMenu} style={[styles.cta, { backgroundColor: c.accent }]}>
          <AccentFill radius={30} />
          <Txt s={16} w={700} color="#FFFFFF">عرض قائمة المطعم</Txt>
          <Icon name="arrow_forward" size={19} color="#FFFFFF" />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 24 },
  hero: { height: 245, overflow: 'hidden' },
  heroTop: { position: 'absolute', zIndex: 2, top: 16, left: 18 },
  heroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.08)' },
  body: { paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  info: { borderWidth: 1, borderRadius: 18, padding: 15, gap: 12, marginTop: 6 },
  infoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, minHeight: 28 },
  menuHeading: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  dish: { minHeight: 86, flexDirection: 'row-reverse', alignItems: 'center', gap: 11, paddingVertical: 10, borderBottomWidth: 1 },
  dishImage: { width: 66, height: 66, borderRadius: 12 },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 22, borderTopWidth: 1 },
  cta: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, overflow: 'hidden' },
});
