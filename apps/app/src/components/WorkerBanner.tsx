/**
 * WorkerBanner — 1080×140 horizontal campaign strip for myTRS party workers.
 *
 * Modeled on the classic political poster bottom-strip: white background,
 * round party emblem on the left, "{Name} - {Area}" in one bold line, and the
 * worker's photo on the right. Brand colors only — navy name, gold area.
 * Everything scales proportionally via `scale = width / 1080`.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fontFamily, fontWeight } from "../theme";
import { RemoteImage } from "./RemoteImage";
import { TRSLogo } from "./TRSLogo";

// ─── public constants ────────────────────────────────────────────────────────

export const BANNER_W = 1080;
export const BANNER_H = 140;

// ─── public interfaces ───────────────────────────────────────────────────────

export interface BannerUser {
  name: string;
  designation?: string | null;
  photoUrl?: string | null;
  tier: string;
  boothName?: string | null;
  orgUnitName?: string | null;
  id: string;
  weeklyLeaguePoints?: number;
  lifetimeReputation?: number;
}

export interface BannerPrefs {
  /** Name color. Defaults to TRS navy. */
  accentColor?: string;
  /** Kept for API compatibility — the strip never shows stats. */
  showStats?: boolean;
}

interface Props {
  user: BannerUser;
  prefs?: BannerPrefs;
  /** Render width in dp. Everything scales proportionally. Default 1080. */
  width?: number;
}

// ─── component ───────────────────────────────────────────────────────────────

export function WorkerBanner({ user, prefs = {}, width = BANNER_W }: Props) {
  const scale = width / BANNER_W;
  const height = Math.round(BANNER_H * scale);
  const s = (dp: number) => dp * scale;

  const nameColor = prefs.accentColor ?? colors.trsNavy;
  const area = user.boothName ?? user.orgUnitName ?? user.designation ?? "";

  return (
    <View style={[styles.root, { width, height }]}>
      {/* gold accent line across the top */}
      <View style={[styles.goldLine, { height: Math.max(1, s(6)) }]} />

      <View style={[styles.row, { paddingHorizontal: s(28), gap: s(24) }]}>
        {/* Left: round TRS emblem */}
        <View
          style={[
            styles.logoRing,
            {
              width: s(100),
              height: s(100),
              borderRadius: s(50),
              borderWidth: Math.max(1, s(3)),
            },
          ]}
        >
          <TRSLogo size={s(94)} showBanner={false} borderRadius={s(47)} />
        </View>

        {/* Middle: Name - Area, one line */}
        <Text
          style={[styles.line, { fontSize: s(52), lineHeight: s(64) }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.55}
        >
          <Text style={[styles.name, { color: nameColor }]}>{user.name}</Text>
          {!!area && <Text style={styles.area}>{"  -  "}{area}</Text>}
        </Text>

        {/* Right: worker photo */}
        <View
          style={[
            styles.photoRing,
            {
              width: s(100),
              height: s(100),
              borderRadius: s(50),
              borderWidth: Math.max(1, s(3)),
            },
          ]}
        >
          <RemoteImage
            uri={user.photoUrl}
            width={s(94)}
            height={s(94)}
            radius={s(47)}
            placeholderColor={colors.trsNavy}
          />
        </View>
      </View>
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    flexDirection: "column",
  },
  goldLine: {
    backgroundColor: colors.trsGold,
    width: "100%",
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  logoRing: {
    borderColor: colors.trsGold,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.trsGold,
  },
  line: {
    flex: 1,
    textAlign: "center",
    fontFamily,
  },
  name: {
    fontWeight: fontWeight.heavy,
    fontFamily,
  },
  area: {
    color: colors.goldDark,
    fontWeight: fontWeight.bold,
    fontFamily,
  },
  photoRing: {
    borderColor: colors.trsNavy,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
