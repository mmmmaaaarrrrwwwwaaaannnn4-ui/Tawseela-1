import { File as FsFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { api, errorMessage } from './api';
import type { UploadResult } from './contract';

export type PhotoUpload = { ok: true; url: string } | { ok: false; cancelled?: boolean; message: string };

/** Where on the image host the photo lands (`<IMAGEKIT_FOLDER>/<folder>`). */
export type PhotoFolder = 'dishes' | 'kitchens' | 'banners' | 'journal';

/**
 * Lets staff pick a photo from the library, then posts it (multipart, field `file`) to the API, which
 * holds the image-host key. Resolves with the photo's public URL to save on a dish, kitchen or story.
 */
export async function pickAndUploadPhoto(aspect: [number, number] = [4, 3], folder?: PhotoFolder): Promise<PhotoUpload> {
  let picked: ImagePicker.ImagePickerResult;
  try {
    picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.8 });
  } catch {
    return { ok: false, message: 'Fig & Fennel can’t open your photos. Allow access in Settings and try again.' };
  }
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return { ok: false, cancelled: true, message: '' };

  const name = asset.fileName ?? `photo-${Date.now()}.jpg`;
  const form = new FormData();
  // fields before the file, so the server sees the folder when it reads the upload
  if (folder) form.append('folder', folder);
  // Expo's fetch reads the part through expo-file-system (it doesn't take React Native's { uri } parts)
  form.append('file', new FsFile(asset.uri), name);
  try {
    const res = await api.upload<UploadResult>('/v1/admin/uploads', form);
    return { ok: true, url: res.url };
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'The photo didn’t upload. Try again.') };
  }
}
