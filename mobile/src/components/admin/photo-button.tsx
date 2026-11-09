import { useState } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icons/icon';
import { Spinner } from '@/components/ui/controls';
import { Glass } from '@/components/ui/glass';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { pickAndUploadPhoto, type PhotoFolder } from '@/lib/uploads';
import { useApp } from '@/store/app-store';
import { useTheme } from '@/theme/theme';

/**
 * Frosted “Replace photo” pill over an editor's photo: picks one from the library and uploads it through
 * the API, then hands back its public URL. Sits bottom-left by default; pass `style` to move it.
 */
export function PhotoButton({
  onUploaded,
  label = 'Replace photo',
  aspect,
  folder,
  style,
}: {
  onUploaded: (url: string) => void;
  label?: string;
  aspect?: [number, number];
  folder?: PhotoFolder;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    if (busy) return;
    setBusy(true);
    const res = await pickAndUploadPhoto(aspect, folder);
    setBusy(false);
    if (res.ok) {
      onUploaded(res.url);
      useApp.getState().showToast('Photo uploaded', 'Save to publish it', 'photo_camera');
    } else if (!res.cancelled) {
      useApp.getState().showToast('Photo not uploaded', res.message, 'error');
    }
  };
  return (
    <PressableScale onPress={() => void pick()} disabled={busy} scaleTo={0.95} accessibilityLabel={label} style={[styles.wrap, style]}>
      <Glass style={styles.pill}>
        {busy ? <Spinner color={c.text1} size={15} /> : <Icon name="photo_camera" size={17} />}
        <Txt s={12.5} w={600}>
          {busy ? 'Uploading…' : label}
        </Txt>
      </Glass>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 10, bottom: 10 },
  pill: { height: 34, paddingHorizontal: 12, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
