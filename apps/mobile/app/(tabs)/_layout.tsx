import { Tabs } from 'expo-router';
import { CalendarDays, House, MessageSquare, Refrigerator, User } from 'lucide-react-native';

import { HapticTab } from '../../src/components/HapticTab';
import { color, fontSize, space, weight } from '../../src/theme';

/**
 * The five-tab bar: Today · Petra · Pantry · Plan · You.
 *
 * The active tint is ink, not a brand accent — this system's primary is
 * near-black, and colour is never used as a small highlight. Icons are Lucide
 * at the system's single line weight; the bar sits on the white canvas with
 * one hairline above it and no blur or elevation.
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: color.ink,
        tabBarInactiveTintColor: color.muted,
        tabBarStyle: {
          backgroundColor: color.canvas,
          borderTopWidth: 1,
          borderTopColor: color.hairline,
          elevation: 0,
          height: 64,
          paddingTop: space.xs,
          paddingBottom: space.xs,
        },
        tabBarLabelStyle: {
          fontFamily: 'SpaceGrotesk_500Medium',
          fontSize: fontSize.legal,
          fontWeight: weight.medium,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color: c }) => <House size={22} color={c} strokeWidth={1.85} />,
        }}
      />
      <Tabs.Screen
        name="petra"
        options={{
          title: 'Petra',
          tabBarIcon: ({ color: c }) => <MessageSquare size={22} color={c} strokeWidth={1.85} />,
        }}
      />
      <Tabs.Screen
        name="pantry"
        options={{
          title: 'Pantry',
          tabBarIcon: ({ color: c }) => <Refrigerator size={22} color={c} strokeWidth={1.85} />,
        }}
      />
      <Tabs.Screen
        name="meal-plans"
        options={{
          title: 'Plan',
          tabBarIcon: ({ color: c }) => <CalendarDays size={22} color={c} strokeWidth={1.85} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'You',
          tabBarIcon: ({ color: c }) => <User size={22} color={c} strokeWidth={1.85} />,
        }}
      />
    </Tabs>
  );
}
