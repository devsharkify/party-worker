import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../theme";

/**
 * Renders a scannable QR for the membership-card payload.
 * react-native-qrcode-svg works on web + native, but we guard with a try/catch
 * render so a missing native module never crashes the profile screen — it falls
 * back to a monospace rendering of the id.
 */
export function QrPayload({
  value,
  size = 132,
  color = colors.bg,
}: {
  value: string;
  size?: number;
  color?: string;
}) {
  let qr: React.ReactNode = null;
  try {
    // Lazy require so a load failure is caught and falls through to the fallback.

    const QRCode = require("react-native-qrcode-svg").default as React.ComponentType<{
      value: string;
      size: number;
      color: string;
      backgroundColor: string;
      ecl?: "L" | "M" | "Q" | "H";
    }>;
    qr = (
      <QRCode value={value} size={size} color={color} backgroundColor="#ffffff" ecl="M" />
    );
  } catch {
    qr = null;
  }

  return (
    <View style={[s.frame, { width: size + 20, height: size + 20 }]}>
      {qr ?? (
        <View style={s.fallback}>
          <Text style={s.fallbackLabel}>ID</Text>
          <Text style={s.fallbackText} numberOfLines={3}>
            {value}
          </Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  frame: {
    backgroundColor: "#fff",
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  fallback: { alignItems: "center", justifyContent: "center", padding: 6 },
  fallbackLabel: { fontSize: 10, fontWeight: "700", color: colors.textMuted, letterSpacing: 1 },
  fallbackText: {
    fontFamily: "monospace",
    fontSize: 10,
    color: colors.text,
    textAlign: "center",
    marginTop: 4,
  },
});
