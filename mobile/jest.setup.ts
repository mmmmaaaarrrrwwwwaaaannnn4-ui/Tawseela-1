jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// Keep tests isolated from the real Replit API URL in mobile/.env.
process.env.EXPO_PUBLIC_API_URL = '';
