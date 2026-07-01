import { useColorScheme as useNativeColorScheme } from 'react-native';
import { useTheme } from '../providers/ThemeProvider';

export function useColorScheme() {
  const { colorScheme } = useTheme();
  return colorScheme;
}
