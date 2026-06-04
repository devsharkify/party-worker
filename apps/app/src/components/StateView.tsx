import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../theme";

/**
 * Centered empty / error state with an optional emoji glyph and a Retry button.
 * Works on web + native (no platform APIs).
 */
export function StateView({
  glyph,
  title,
  message,
  retryLabel,
  onRetry,
  dark = false,
  tone = "muted",
}: {
  glyph?: string;
  title: string;
  message?: string;
  retryLabel?: string;
  onRetry?: () => void;
  dark?: boolean;
  tone?: "muted" | "error";
}) {
  const titleColor = dark ? colors.textOnDark : colors.text;
  const msgColor = dark ? colors.textMutedOnDark : colors.textMuted;
  return (
    <View style={s.wrap}>
      {glyph ? (
        <View style={[s.glyphRing, tone === "error" && { borderColor: colors.danger + "55" }]}>
          <Text style={s.glyph}>{glyph}</Text>
        </View>
      ) : null}
      <Text style={[s.title, { color: tone === "error" ? colors.danger : titleColor }]}>{title}</Text>
      {message ? <Text style={[s.message, { color: msgColor }]}>{message}</Text> : null}
      {onRetry && retryLabel ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [s.retry, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={s.retryText}>↻ {retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingVertical: 56 },
  glyphRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: 16,
  },
  glyph: { fontSize: 32 },
  title: { fontSize: 17, fontWeight: "800", textAlign: "center" },
  message: { fontSize: 14, textAlign: "center", marginTop: 6, lineHeight: 20 },
  retry: {
    marginTop: 18,
    backgroundColor: colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: radius.md,
  },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
