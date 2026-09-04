import { Platform } from 'react-native';

// Set EXPO_PUBLIC_API_URL in packages/mobile/.env to point the app at your
// backend. Required when testing on a physical device via Expo Go, since
// "localhost" on the phone means the phone itself, not this computer.
// See packages/mobile/.env.example.
const DEV_FALLBACK = Platform.OS === 'android' ? 'http://10.0.2.2:3001/api' : 'http://localhost:3001/api';
const PROD_URL = 'https://api.petra-ai.com/api';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? DEV_FALLBACK : PROD_URL);
