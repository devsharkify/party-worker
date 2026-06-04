import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type DimensionValue, type ViewStyle } from "react-native";
import { colors, radius } from "../theme";

/** A single pulsing placeholder block. Pure-RN Animated → works on web + native. */
export function SkeletonBlock({
  width = "100%",
  height = 16,
  rounded = radius.sm,
  dark = false,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  rounded?: number;
  dark?: boolean;
  style?: ViewStyle;
}) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: rounded,
          backgroundColor: dark ? colors.skeletonOnDark : colors.skeleton,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

/** A feed-card shaped skeleton. */
export function FeedCardSkeleton() {
  return (
    <View style={s.card}>
      <SkeletonBlock height={180} rounded={0} />
      <View style={s.body}>
        <SkeletonBlock width={90} height={20} rounded={radius.pill} />
        <SkeletonBlock width="70%" height={20} style={{ marginTop: 12 }} />
        <SkeletonBlock width="95%" height={14} style={{ marginTop: 10 }} />
        <SkeletonBlock width="60%" height={14} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

/** A leaderboard-row shaped skeleton. */
export function RowSkeleton() {
  return (
    <View style={s.row}>
      <SkeletonBlock width={24} height={20} />
      <SkeletonBlock width={40} height={40} rounded={20} />
      <View style={{ flex: 1 }}>
        <SkeletonBlock width="55%" height={15} />
        <SkeletonBlock width={64} height={12} style={{ marginTop: 6 }} />
      </View>
      <SkeletonBlock width={36} height={18} />
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  body: { padding: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 10,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
