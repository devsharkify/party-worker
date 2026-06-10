import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { colors, fontFamily, lh, radius, shadow } from "../theme";

export function Screen({
  children,
  scroll = true,
  dark = false,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  dark?: boolean;
}) {
  const bg = dark ? colors.bg : colors.cardMuted;
  if (scroll) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={s.scrollContent}>
        {children}
      </ScrollView>
    );
  }
  return <View style={{ flex: 1, backgroundColor: bg, padding: 16 }}>{children}</View>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  function handlePress() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: disabled ? "#9AA3B8" : colors.primary, opacity: pressed ? 0.82 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={s.btnText}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Pill({ label, color = colors.primary }: { label: string; color?: string }) {
  return (
    <View style={[s.pill, { backgroundColor: color + "22", borderColor: color }]}>
      <Text style={[s.pillText, { color }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 48 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  btn: {
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  btnText: { color: "#fff", fontSize: 17, fontWeight: "700", fontFamily, lineHeight: lh(17) },
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: "700", fontFamily, lineHeight: lh(12) },
});
