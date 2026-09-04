import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Search, X } from 'lucide-react-native';

import { color, fontSize, radius, space, type } from '../theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

/**
 * Inputs take the system's small radius and its single hairline border —
 * no fill, no shadow, no focus glow beyond the border.
 */
export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search',
  onClear,
  onFocus,
  onBlur,
}: SearchBarProps) {
  const handleClear = () => {
    onChangeText('');
    onClear?.();
  };

  return (
    <View style={styles.container}>
      <Search size={18} color={color.muted} strokeWidth={1.85} />

      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.muted}
        onFocus={onFocus}
        onBlur={onBlur}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
      />

      {value.length > 0 && (
        <Pressable
          onPress={handleClear}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={18} color={color.muted} strokeWidth={1.85} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.hairline,
    backgroundColor: color.canvas,
  },
  input: {
    ...type.bodyMd,
    flex: 1,
    fontSize: fontSize.labelMd,
    paddingVertical: 0,
    color: color.ink,
  },
});
