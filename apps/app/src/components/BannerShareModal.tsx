import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { captureRef } from "react-native-view-shot";
import { useTranslation } from "react-i18next";
import type { FeedItem, SocialAccountInfo } from "@pw/shared";
import { useAuth } from "../auth/auth-context";
import { WorkerBanner, BannerUser } from "./WorkerBanner";
import { RemoteImage } from "./RemoteImage";
import {
  colors,
  fontFamily,
  fontWeight,
  lh,
  radius,
  shadow,
} from "../theme";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  item: FeedItem | null;
  visible: boolean;
  onClose: () => void;
  user: BannerUser;
}

type Status = "idle" | "capturing" | "uploading" | "posting" | "done" | "error";

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPOSITE_W = 340; // dp — composite width (scales the 1080 design)
const STRIP_H = Math.round(COMPOSITE_W * (240 / 1080)); // banner height
// Images share as a square (1080×1080 + strip below = 1080×1320).
const SQUARE_H = COMPOSITE_W;
// Videos are 9:16 portrait (1080×1920) — strip OVERLAYS the bottom so the
// final frame stays exactly 1080×1920 (Reels / Status ready).
const PORTRAIT_H = Math.round(COMPOSITE_W * (1920 / 1080));

// ─── Component ────────────────────────────────────────────────────────────────

export function BannerShareModal({ item, visible, onClose, user }: Props) {
  const { i18n } = useTranslation();
  const { api } = useAuth();
  const compositeRef = useRef<View>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errMsg, setErrMsg] = useState<string>("");
  const [accounts, setAccounts] = useState<SocialAccountInfo[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    api<SocialAccountInfo[]>("/social/accounts")
      .then((list) => {
        const connected = list.filter((a) => a.connected && a.platform === "instagram");
        setAccounts(connected);
        const primary = connected.find((a) => a.isPrimary) ?? connected[0];
        setSelectedAccountId(primary?.id ?? null);
      })
      .catch(() => {});
  }, [visible]);

  // Guard: nothing to render without an item
  if (!item) return null;

  const isBusy =
    status === "capturing" ||
    status === "uploading" ||
    status === "posting";

  const te = i18n.language !== "en";
  const statusLabel: Record<Status, string> = {
    idle: te ? "ఇన్‌స్టాగ్రామ్‌లో షేర్ చేయండి" : "Share to Instagram",
    capturing: te ? "క్యాప్చర్ అవుతోంది…" : "Capturing…",
    uploading: te ? "అప్‌లోడ్ అవుతోంది…" : "Uploading…",
    posting: te ? "పబ్లిష్ అవుతోంది…" : "Publishing…",
    done: te ? "పోస్ట్ అయింది!" : "Posted!",
    error: te ? "ఇన్‌స్టాగ్రామ్‌లో షేర్ చేయండి" : "Share to Instagram",
  };

  async function handleShare() {
    if (!item) return;
    try {
      // 1–3. Capture the composite and upload it. If capture fails (e.g. a
      // platform where view-shot can't snapshot), fall back to publishing the
      // creative itself — the post still goes out, just without the banner.
      let compositeUrl: string | undefined;
      try {
        setStatus("capturing");
        const uri = await captureRef(compositeRef, {
          format: "jpg",
          quality: 0.92,
        });

        setStatus("uploading");
        const res = await fetch(uri);
        const blob = await res.blob();
        const fd = new FormData();
        fd.append("file", blob as unknown as Blob, "banner-share.jpg");

        const { url } = await api<{ key: string; url: string }>(
          "/creatives/upload",
          { method: "POST", body: fd }
        );
        compositeUrl = url;
      } catch {
        compositeUrl = undefined;
      }

      // 4. Publish to Instagram — creativeId drives caption + reach
      // attribution server-side; mediaUrl overrides the posted image with
      // the banner composite when capture succeeded.
      setStatus("posting");
      await api("/social/instagram/publish", {
        method: "POST",
        body: JSON.stringify({
          creativeId: item.creativeId,
          kind: "feed",
          ...(compositeUrl ? { mediaUrl: compositeUrl } : {}),
          ...(selectedAccountId ? { socialAccountId: selectedAccountId } : {}),
        }),
      });

      setStatus("done");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setErrMsg(msg);
      setStatus("error");
    }
  }

  function handleClose() {
    setStatus("idle");
    setErrMsg("");
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <Pressable onPress={handleClose} style={s.closeBtn} hitSlop={12}>
          <Text style={s.closeText}>{te ? "← మూసివేయి" : "← Close"}</Text>
        </Pressable>
        <Text style={s.headerTitle}>{te ? "బ్యానర్‌తో షేర్ చేయండి" : "Share with Banner"}</Text>
        {/* spacer to center the title */}
        <View style={s.headerSpacer} />
      </View>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
      >
        {/* Composite preview ─────────────────────────────────────────── */}
        <View style={s.compositeWrapper}>
          {/*
           * collapsable={false} is required so react-native-view-shot
           * can capture this view on Android.
           */}
          <View
            ref={compositeRef}
            collapsable={false}
            style={[
              s.composite,
              { height: item.type === "video" ? PORTRAIT_H : SQUARE_H + STRIP_H },
            ]}
          >
            {/* Creative: full-bleed 9:16 for video, square for images */}
            <RemoteImage
              uri={item.thumbnailUrl ?? item.sourceUrl}
              width={COMPOSITE_W}
              height={item.type === "video" ? PORTRAIT_H : SQUARE_H}
            />

            {/* Worker banner — overlaid at the bottom for video (frame stays
                1080×1920); appended below the square for images */}
            <View style={item.type === "video" ? s.stripOverlay : undefined}>
              <WorkerBanner user={user} width={COMPOSITE_W} />
            </View>
          </View>
        </View>

        {/* Hint */}
        <Text style={s.hint}>Your personalized banner</Text>

        {/* ── Account picker (only shown when worker has multiple accounts) ── */}
        {accounts.length > 1 && status === "idle" && (
          <View style={s.pickerWrapper}>
            <Text style={s.pickerLabel}>
              {i18n.language !== "en" ? "అకౌంట్ ఎంచుకోండి" : "Post from"}
            </Text>
            {accounts.map((acct) => {
              const selected = acct.id === selectedAccountId;
              return (
                <Pressable
                  key={acct.id}
                  style={[s.accountRow, selected && s.accountRowSelected]}
                  onPress={() => setSelectedAccountId(acct.id)}
                >
                  <View style={[s.radioCircle, selected && s.radioCircleSelected]} />
                  <Text style={[s.accountHandle, selected && s.accountHandleSelected]}>
                    @{acct.handle ?? acct.id.slice(-6)}
                  </Text>
                  {acct.isPrimary && (
                    <Text style={s.primaryBadge}>
                      {i18n.language !== "en" ? "ప్రాథమిక" : "Primary"}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Share button ─────────────────────────────────────────────── */}
        {status !== "done" && (
          <Pressable
            style={[s.shareBtn, isBusy && s.shareBtnDisabled]}
            onPress={handleShare}
            disabled={isBusy}
          >
            {isBusy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={s.shareBtnText}>
                {"📸"} {statusLabel[status]}
              </Text>
            )}
          </Pressable>
        )}

        {/* ── Done state ───────────────────────────────────────────────── */}
        {status === "done" && (
          <View style={s.doneBox}>
            <Text style={s.doneText}>Copied to Instagram!</Text>
          </View>
        )}

        {/* ── Error state ──────────────────────────────────────────────── */}
        {status === "error" && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{errMsg}</Text>
            <Pressable
              onPress={() => {
                setStatus("idle");
                setErrMsg("");
              }}
              hitSlop={8}
            >
              <Text style={s.retryText}>Try again</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  /* Header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.navy,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  closeBtn: {
    minWidth: 72,
  },
  closeText: {
    color: colors.textOnDark,
    fontSize: 15,
    fontFamily,
    fontWeight: fontWeight.semibold,
    lineHeight: lh(15),
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: colors.textOnDark,
    fontSize: 17,
    fontFamily,
    fontWeight: fontWeight.bold,
    lineHeight: lh(17),
  },
  headerSpacer: {
    minWidth: 72,
  },

  /* Body */
  body: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 20,
    backgroundColor: colors.bg,
    flexGrow: 1,
  },

  /* Composite */
  compositeWrapper: {
    borderWidth: 2,
    borderColor: colors.gold,
    borderRadius: radius.sm,
    overflow: "hidden",
    ...shadow,
  },
  composite: {
    width: COMPOSITE_W,
    flexDirection: "column",
    overflow: "hidden",
  },
  stripOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Math.round(PORTRAIT_H * 0.15),
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },

  /* Hint */
  hint: {
    marginTop: 12,
    marginBottom: 28,
    color: colors.textMuted,
    fontSize: 13,
    fontFamily,
    fontWeight: fontWeight.regular,
    lineHeight: lh(13),
    textAlign: "center",
  },

  /* Account picker */
  pickerWrapper: {
    width: "100%",
    marginBottom: 20,
    gap: 8,
  },
  pickerLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily,
    fontWeight: fontWeight.semibold,
    lineHeight: lh(12),
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border ?? "#e5e7eb",
    backgroundColor: colors.bgElevated ?? "#ffffff",
  },
  accountRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft ?? "#eff6ff",
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textMuted,
  },
  radioCircleSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  accountHandle: {
    flex: 1,
    color: colors.text ?? "#111827",
    fontSize: 14,
    fontFamily,
    fontWeight: fontWeight.semibold,
    lineHeight: lh(14),
  },
  accountHandleSelected: {
    color: colors.primary,
  },
  primaryBadge: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily,
    fontWeight: fontWeight.regular,
    lineHeight: lh(11),
    backgroundColor: colors.bg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },

  /* Share button */
  shareBtn: {
    width: "100%",
    height: 52,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    ...shadow,
  },
  shareBtnDisabled: {
    opacity: 0.65,
  },
  shareBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily,
    fontWeight: fontWeight.bold,
    lineHeight: lh(16),
  },

  /* Done */
  doneBox: {
    marginTop: 16,
    alignItems: "center",
  },
  doneText: {
    color: colors.success,
    fontSize: 16,
    fontFamily,
    fontWeight: fontWeight.semibold,
    lineHeight: lh(16),
  },

  /* Error */
  errorBox: {
    marginTop: 16,
    alignItems: "center",
    gap: 8,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    fontFamily,
    fontWeight: fontWeight.regular,
    lineHeight: lh(14),
    textAlign: "center",
  },
  retryText: {
    color: colors.primary,
    fontSize: 14,
    fontFamily,
    fontWeight: fontWeight.semibold,
    lineHeight: lh(14),
    textDecorationLine: "underline",
  },
});
