/**
 * WorkerBanner — 350×1080 personalized campaign banner for myTRS party workers.
 *
 * The banner is a tall portrait strip (350 wide × 1080 tall) designed to be
 * composited with video thumbnails for Instagram sharing. Everything scales
 * proportionally via `scale = width / 350`.
 *
 * Sections:
 *   Header  160dp — TRS gold (#E8A820), logo + party names
 *   Body    740dp — TRS navy (#1A3580 or accentColor), worker photo + info
 *   Footer  180dp — TRS green (#2B5216), myTRS branding
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fontFamily, fontWeight, lh, tierColor } from "../theme";
import { RemoteImage } from "./RemoteImage";
import { TRSLogo } from "./TRSLogo";

// ─── public constants ────────────────────────────────────────────────────────

export const BANNER_W = 350;
export const BANNER_H = 1080;

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
  /** Body background color. Defaults to colors.trsNavy (#1A3580). */
  accentColor?: string;
  /** Show weeklyLeaguePoints + lifetimeReputation in gold. Default false. */
  showStats?: boolean;
}

interface Props {
  user: BannerUser;
  prefs?: BannerPrefs;
  /** Render width in dp. Everything scales proportionally. Default 350. */
  width?: number;
}

// ─── component ───────────────────────────────────────────────────────────────

export function WorkerBanner({ user, prefs = {}, width = BANNER_W }: Props) {
  const scale = width / BANNER_W;
  const height = Math.round(BANNER_H * scale);

  const bodyBg = prefs.accentColor ?? colors.trsNavy;
  const showStats = prefs.showStats ?? false;

  // Resolve tier color; fall back to gold if tier is unknown.
  const tierC = tierColor[user.tier.toLowerCase()] ?? colors.gold;
  const tierBg = tierC + "22";

  // Truncate ID to first 8 chars for display.
  const shortId = user.id.slice(0, 8).toUpperCase();

  // Scaled helpers — keeps all layout values at scale=1 in the source.
  const s = (dp: number) => dp * scale;

  return (
    <View style={[styles.root, { width, height }]}>
      {/* ── HEADER: gold, 160dp ──────────────────────────────────── */}
      <View style={[styles.header, { height: s(160), paddingHorizontal: s(16) }]}>
        <TRSLogo size={s(72)} showBanner={false} borderRadius={s(6)} />

        {/* Party names to the right of the logo */}
        <View style={[styles.headerNames, { marginLeft: s(12) }]}>
          <Text
            style={[
              styles.headerTelugu,
              {
                fontSize: s(15),
                lineHeight: lh(s(15)),
              },
            ]}
            numberOfLines={2}
          >
            తెలంగాణ రక్షణ సేన
          </Text>
          <Text
            style={[
              styles.headerEnglish,
              {
                fontSize: s(9),
                lineHeight: lh(s(9)),
                letterSpacing: s(0.8),
              },
            ]}
            numberOfLines={2}
          >
            TELANGANA RAKSHANA SENA
          </Text>
        </View>
      </View>

      {/* ── BODY: navy (or accentColor), flex to fill ────────────── */}
      <View style={[styles.body, { backgroundColor: bodyBg, paddingHorizontal: s(24) }]}>

        {/* Worker photo — 96dp circle with 3dp gold border */}
        <View
          style={[
            styles.photoRing,
            {
              width: s(96) + s(6),   // diameter + 2×border
              height: s(96) + s(6),
              borderRadius: (s(96) + s(6)) / 2,
              borderWidth: s(3),
              marginTop: s(32),
              marginBottom: s(12),
            },
          ]}
        >
          <RemoteImage
            uri={user.photoUrl}
            width={s(96)}
            height={s(96)}
            radius={s(48)}
            placeholderColor={colors.trsNavy}
          />
        </View>

        {/* Tier badge pill */}
        <View
          style={[
            styles.tierBadge,
            {
              borderColor: tierC,
              backgroundColor: tierBg,
              paddingHorizontal: s(10),
              paddingVertical: s(3),
              borderRadius: s(999),
              borderWidth: s(1),
              marginBottom: s(14),
            },
          ]}
        >
          <Text
            style={[
              styles.tierText,
              {
                color: tierC,
                fontSize: s(11),
                lineHeight: lh(s(11)),
              },
            ]}
          >
            {user.tier.toUpperCase()}
          </Text>
        </View>

        {/* Worker name */}
        <Text
          style={[
            styles.nameText,
            {
              fontSize: s(24),
              lineHeight: lh(s(24)),
              marginBottom: s(4),
            },
          ]}
          numberOfLines={2}
        >
          {user.name}
        </Text>

        {/* Designation */}
        {!!user.designation && (
          <Text
            style={[
              styles.designationText,
              {
                fontSize: s(14),
                lineHeight: lh(s(14)),
                marginBottom: s(18),
              },
            ]}
            numberOfLines={2}
          >
            {user.designation}
          </Text>
        )}

        {/* Divider */}
        <View
          style={[
            styles.divider,
            {
              width: "80%",
              height: StyleSheet.hairlineWidth < 1 ? 1 : StyleSheet.hairlineWidth,
              marginBottom: s(14),
            },
          ]}
        />

        {/* Org unit */}
        {!!user.orgUnitName && (
          <Text
            style={[
              styles.metaText,
              {
                fontSize: s(11),
                lineHeight: lh(s(11)),
                marginBottom: s(6),
              },
            ]}
            numberOfLines={2}
          >
            {"🏛  "}{user.orgUnitName}
          </Text>
        )}

        {/* Booth location */}
        {!!user.boothName && (
          <Text
            style={[
              styles.metaText,
              {
                fontSize: s(11),
                lineHeight: lh(s(11)),
                marginBottom: s(6),
              },
            ]}
            numberOfLines={2}
          >
            {"📍  "}{user.boothName}
          </Text>
        )}

        {/* Optional stats row */}
        {showStats && (
          <View style={[styles.statsRow, { marginTop: s(10), gap: s(16) }]}>
            {user.weeklyLeaguePoints !== undefined && (
              <Text
                style={[
                  styles.statText,
                  {
                    fontSize: s(11),
                    lineHeight: lh(s(11)),
                  },
                ]}
              >
                {user.weeklyLeaguePoints} pts
              </Text>
            )}
            {user.lifetimeReputation !== undefined && (
              <Text
                style={[
                  styles.statText,
                  {
                    fontSize: s(11),
                    lineHeight: lh(s(11)),
                  },
                ]}
              >
                {user.lifetimeReputation} rep
              </Text>
            )}
          </View>
        )}

        {/* Spacer pushes ID to the bottom */}
        <View style={styles.flex1} />

        {/* Worker ID — bottom of body */}
        <Text
          style={[
            styles.idText,
            {
              fontSize: s(10),
              lineHeight: lh(s(10)),
              marginBottom: s(16),
            },
          ]}
        >
          ID: {shortId}
        </Text>
      </View>

      {/* ── FOOTER: TRS green, 180dp ─────────────────────────────── */}
      <View style={[styles.footer, { height: s(180) }]}>
        <Text
          style={[
            styles.footerBrand,
            {
              fontSize: s(10),
              lineHeight: lh(s(10)),
              marginBottom: s(4),
            },
          ]}
        >
          myTRS
        </Text>
        <Text
          style={[
            styles.footerSub,
            {
              fontSize: s(8),
              lineHeight: lh(s(8)),
            },
          ]}
        >
          Telangana Rakshana Sena
        </Text>
      </View>
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
    flexDirection: "column",
  },

  // Header
  header: {
    backgroundColor: colors.trsGold,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  headerNames: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
  },
  headerTelugu: {
    color: colors.trsNavy,
    fontFamily,
    fontWeight: fontWeight.bold,
  },
  headerEnglish: {
    color: colors.trsNavy,
    fontFamily,
    fontWeight: fontWeight.semibold,
  },

  // Body
  body: {
    flex: 1,
    alignItems: "center",
  },
  photoRing: {
    borderColor: colors.trsGold,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  tierBadge: {
    alignItems: "center",
    justifyContent: "center",
  },
  tierText: {
    fontFamily,
    fontWeight: fontWeight.bold,
  },
  nameText: {
    color: colors.textOnDark,
    fontFamily,
    fontWeight: fontWeight.bold,
    textAlign: "center",
  },
  designationText: {
    color: colors.textOnDark,
    fontFamily,
    fontWeight: fontWeight.regular,
    textAlign: "center",
    opacity: 0.7,
  },
  divider: {
    backgroundColor: colors.textOnDark,
    opacity: 0.15,
    alignSelf: "center",
  },
  metaText: {
    color: colors.textOnDark,
    fontFamily,
    fontWeight: fontWeight.regular,
    textAlign: "center",
    opacity: 0.7,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  statText: {
    color: colors.trsGold,
    fontFamily,
    fontWeight: fontWeight.semibold,
  },
  flex1: {
    flex: 1,
  },
  idText: {
    color: colors.textOnDark,
    fontFamily: "monospace",
    fontWeight: fontWeight.regular,
    textAlign: "center",
    opacity: 0.35,
  },

  // Footer
  footer: {
    backgroundColor: colors.trsGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  footerBrand: {
    color: colors.trsGold,
    fontFamily,
    fontWeight: fontWeight.bold,
  },
  footerSub: {
    color: colors.textOnDark,
    fontFamily,
    fontWeight: fontWeight.regular,
  },
});
