import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors } from '../../constants/Colors';
import { useColorScheme } from '../../hooks/useColorScheme';

export default function TabBarBackground() {
  const colorScheme = useColorScheme();

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <BlurView
        intensity={100}
        style={StyleSheet.absoluteFillObject}
        tint={colorScheme}
      />
      <View
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: Colors[colorScheme ?? 'light'].background + 'CC',
          },
        ]}
      />
    </View>
  );
}
