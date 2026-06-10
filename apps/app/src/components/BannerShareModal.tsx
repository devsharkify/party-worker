import React, { useRef, useState } from "react";
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
import type { FeedItem } from "@pw/shared";
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

const COMPOSITE_SIZE = 300; // dp — creative is a square this wide
const STRIP_H = Math.round(COMPOSITE_SIZE * (240 / 1080)); // strip height ≈ 67 dp

// ─── Component ────────────────────────────────────────────────────────────────

export function BannerShareModal({ item, visible, onClose, user }: Props) {
  const { api } = useAuth();
  const compositeRef = useRef<View>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errMsg, setErrMsg] = useState<string>("");

  // Guard: nothing to render without an item
  if (!item) return null;

  const isBusy =
    status === "capturing" ||
    status === "uploading" ||
    status === "posting";

  const statusLabel: Record<Status, string> = {
    idle: "Share to Instagram",
    capturing: "Capturing…",
    uploading: "Uploading…",
    posting: "Publishing…",
    done: "Posted!",
    error: "Share to Instagram",
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
          <Text style={s.closeText}>← Close</Text>
        </Pressable>
        <Text style={s.headerTitle}>Share with Banner</Text>
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
            style={s.composite}
          >
            {/* TOP: creative thumbnail */}
            <RemoteImage
              uri={item.thumbnailUrl ?? item.sourceUrl}
              width={COMPOSITE_SIZE}
              height={COMPOSITE_SIZE}
            />

            {/* BOTTOM: worker strip banner */}
            <WorkerBanner user={user} width={COMPOSITE_SIZE} />
          </View>
        </View>

        {/* Hint */}
        <Text style={s.hint}>Your personalized banner</Text>

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
    width: COMPOSITE_SIZE,
    height: COMPOSITE_SIZE + STRIP_H,
    flexDirection: "column",
    overflow: "hidden",
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
