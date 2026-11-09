import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

/**
 * AsyncStorage for zustand's `persist`. Every call resolves the module lazily (the form Expo recommends),
 * and a failed read or write never takes the app down: the store just starts from its defaults.
 */
export const deviceStorage: StateStorage = {
  getItem: async (key) => {
    try {
      return await AsyncStorage.getItem(key);
    } catch (e) {
      console.warn('[storage] read failed', key, e);
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      console.warn('[storage] write failed', key, e);
    }
  },
  removeItem: async (key) => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.warn('[storage] remove failed', key, e);
    }
  },
};
