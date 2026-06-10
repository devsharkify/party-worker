/**
 * WorkerBanner — 1080×240 horizontal campaign strip for myTRS party workers.
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
export const BANNER_H = 240;

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

  // Char-count-based auto-fit (adjustsFontSizeToFit is iOS-only; web/Android
  // would silently truncate). Middle column at 1080 is ~600 units wide.
  const fit = (base: number, text: string, avg = 0.58) =>
    Math.min(base, Math.floor(600 / (avg * Math.max(1, text.length))));
  const nameSize = fit(84, user.name);
  const areaSize = fit(54, area);

  return (
    <View style={[styles.root, { width, height }]}>
      {/* gold accent line across the top */}
      <View style={[styles.goldLine, { height: Math.max(1, s(10)) }]} />

      <View style={[styles.row, { paddingHorizontal: s(40), gap: s(32) }]}>
        {/* Left: round TRS emblem */}
        <View
          style={[
            styles.logoRing,
            {
              width: s(170),
              height: s(170),
              borderRadius: s(85),
              borderWidth: Math.max(1, s(5)),
            },
          ]}
        >
          <TRSLogo size={s(160)} showBanner={false} borderRadius={s(80)} />
        </View>

        {/* Middle: name stacked over division — classic poster lockup */}
        <View style={styles.centerCol}>
          <Text
            style={[styles.name, { color: nameColor, fontSize: s(nameSize), lineHeight: s(Math.round(nameSize * 1.22)) }]}
            numberOfLines={1}
          >
            {user.name}
          </Text>
          {!!area && (
            <Text
              style={[styles.area, { fontSize: s(areaSize), lineHeight: s(Math.round(areaSize * 1.25)), marginTop: s(6) }]}
              numberOfLines={1}
            >
              {area}
            </Text>
          )}
        </View>

        {/* Right: worker photo */}
        <View
          style={[
            styles.photoRing,
            {
              width: s(170),
              height: s(170),
              borderRadius: s(85),
              borderWidth: Math.max(1, s(5)),
            },
          ]}
        >
          <RemoteImage
            uri={user.photoUrl}
            width={s(160)}
            height={s(160)}
            radius={s(80)}
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
  centerCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontWeight: fontWeight.heavy,
    fontFamily,
    textAlign: "center",
  },
  area: {
    color: colors.goldDark,
    fontWeight: fontWeight.bold,
    fontFamily,
    textAlign: "center",
    letterSpacing: 1,
  },
  photoRing: {
    borderColor: colors.trsNavy,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
