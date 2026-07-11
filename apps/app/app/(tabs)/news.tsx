import {
  Dimensions,
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { RemoteImage } from "../../src/components/RemoteImage";
import { useApi } from "../../src/hooks";
import { useAuth } from "../../src/auth/auth-context";
import { colors, fontFamily, lh, radius, shadow } from "../../src/theme";
import { API_URL } from "../../src/config";

const SCREEN_W = Dimensions.get("window").width;
const CARD_W = Math.min(SCREEN_W, 480);

type NewsItem = {
  id: string;
  handle: string;
  title: string;
  body: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  publishedAt: string;
  isBreaking: boolean;
  shareCount: number;
};

type PollResult = {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
  endsAt: string;
  totalVotes: number;
  aCount: number;
  bCount: number;
  myChoice: "A" | "B" | null;
};

type PollListItem = {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
  endsAt: string;
  _count: { votes: number };
};

function PollCard({ poll, onVoted }: { poll: PollListItem; onVoted: (result: PollResult) => void }) {
  const { api } = useAuth();
  const [result, setResult] = useState<PollResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function vote(choice: "A" | "B") {
    if (busy || result) return;
    setBusy(true);
    try {
      const r = await api<PollResult>(`/polls/${poll.id}/vote`, { method: "POST", body: JSON.stringify({ choice }) });
      setResult(r);
      onVoted(r);
    } catch {
      // already voted — fetch results
      const r = await api<PollResult>(`/polls/${poll.id}/results`).catch(() => null);
      if (r) setResult(r);
    } finally {
      setBusy(false);
    }
  }

  const total = result?.totalVotes ?? poll._count.votes;
  const aCount = result?.aCount ?? 0;
  const bCount = result?.bCount ?? 0;
  const aPct = total > 0 ? Math.round((aCount / total) * 100) : 0;
  const bPct = total > 0 ? Math.round((bCount / total) * 100) : 0;
  const voted = !!result?.myChoice;

  return (
    <View style={st.pollCard}>
      <Text style={st.pollQuestion}>{poll.question}</Text>
      <View style={{ gap: 8, marginTop: 10 }}>
        {(["A", "B"] as const).map((choice) => {
          const label = choice === "A" ? poll.optionA : poll.optionB;
          const pct = choice === "A" ? aPct : bPct;
          const isChosen = result?.myChoice === choice;
          return (
            <Pressable
              key={choice}
              onPress={() => vote(choice)}
              disabled={voted || busy}
              style={({ pressed }) => [st.pollOption, isChosen && st.pollOptionChosen, pressed && { opacity: 0.8 }]}
            >
              {voted && (
                <View style={[st.pollBar, { width: `${pct}%` as `${number}%` }]} />
              )}
              <Text style={[st.pollOptionText, isChosen && st.pollOptionTextChosen]}>
                {label}{voted ? `  ${pct}%` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={st.pollMeta}>{total} votes · ends {timeAgo(poll.endsAt)}</Text>
    </View>
  );
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ShareSheet({
  item,
  onClose,
  onShareDone,
}: {
  item: NewsItem;
  onClose: () => void;
  onShareDone: () => void;
}) {
  const summary = item.body.length > 220 ? `${item.body.slice(0, 220).trimEnd()}…` : item.body;
  const cardUrl = `${API_URL}/news/${item.id}/card`;
  const shareText = `📰 ${item.title}\n\n${summary}\n\n${cardUrl}`;

  function done() { onShareDone(); onClose(); }

  async function toWhatsApp() {
    const encoded = encodeURIComponent(shareText);
    const url = `whatsapp://send?text=${encoded}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      await Linking.openURL(`https://web.whatsapp.com/send?text=${encoded}`);
    }
    done();
  }

  async function toWhatsAppStatus() {
    if (Platform.OS !== "web" && item.imageUrl) {
      try {
        const MediaLibrary = await import("expo-media-library");
        const FileSystem = await import("expo-file-system/legacy");
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === "granted") {
          const dest = `${FileSystem.cacheDirectory}wa-status-news.jpg`;
          await FileSystem.downloadAsync(item.imageUrl, dest);
          await MediaLibrary.saveToLibraryAsync(dest);
        }
      } catch { /* non-critical */ }
    }
    const supported = await Linking.canOpenURL("whatsapp://status");
    if (supported) {
      await Linking.openURL("whatsapp://status");
    } else {
      await Linking.openURL("https://web.whatsapp.com");
    }
    done();
  }

  async function toInstagram() {
    const supported = await Linking.canOpenURL("instagram://");
    if (supported) {
      await Linking.openURL("instagram://");
    } else {
      await Linking.openURL("https://www.instagram.com");
    }
    done();
  }

  async function nativeShare() {
    try {
      await Share.share({ message: shareText, title: item.title });
    } catch {}
    done();
  }

  return (
    <Pressable style={st.sheetOverlay} onPress={onClose}>
      <Pressable style={st.sheet} onPress={() => {}}>
        <View style={st.sheetHandle} />
        <Text style={st.sheetTitle}>Share</Text>

        <View style={st.sheetRow}>
          <Pressable style={({ pressed }) => [st.sheetBtn, pressed && { opacity: 0.75 }]} onPress={toWhatsApp}>
            <View style={[st.sheetIcon, { backgroundColor: "#25D366" }]}>
              <Feather name="message-circle" size={22} color="#fff" />
            </View>
            <Text style={st.sheetLabel}>WhatsApp</Text>
          </Pressable>

          <Pressable style={({ pressed }) => [st.sheetBtn, pressed && { opacity: 0.75 }]} onPress={toWhatsAppStatus}>
            <View style={[st.sheetIcon, { backgroundColor: "#075e54" }]}>
              <Feather name="circle" size={22} color="#fff" />
            </View>
            <Text style={st.sheetLabel}>WA Status</Text>
          </Pressable>

          <Pressable style={({ pressed }) => [st.sheetBtn, pressed && { opacity: 0.75 }]} onPress={toInstagram}>
            <View style={[st.sheetIcon, { backgroundColor: "#c13584" }]}>
              <Feather name="instagram" size={22} color="#fff" />
            </View>
            <Text style={st.sheetLabel}>Instagram</Text>
          </Pressable>

          <Pressable style={({ pressed }) => [st.sheetBtn, pressed && { opacity: 0.75 }]} onPress={nativeShare}>
            <View style={[st.sheetIcon, { backgroundColor: colors.primary }]}>
              <Feather name="share-2" size={22} color="#fff" />
            </View>
            <Text style={st.sheetLabel}>More</Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
}

function NewsCard({
  item,
  index,
  total,
  onShare,
}: {
  item: NewsItem;
  index: number;
  total: number;
  onShare: (item: NewsItem) => void;
}) {
  return (
    <View style={[st.card, { width: CARD_W }]}>
      {item.isBreaking ? (
        <View style={st.breakingBanner}>
          <Text style={st.breakingText}>🔴 BREAKING</Text>
        </View>
      ) : null}
      {item.imageUrl && (
        <RemoteImage uri={item.imageUrl} width={CARD_W} height={220} />
      )}

      <View style={st.cardBody}>
        {/* Handle + time */}
        <View style={st.cardMeta}>
          <View style={st.handlePill}>
            <Feather name="at-sign" size={11} color={colors.primary} />
            <Text style={st.handleText}>
              {item.handle.replace(/^@/, "")}
            </Text>
          </View>
          <Text style={st.timeText}>{timeAgo(item.publishedAt)}</Text>
        </View>

        <Text style={st.cardTitle} numberOfLines={3}>
          {item.title}
        </Text>
        <Text style={st.cardBody2} numberOfLines={5}>
          {item.body}
        </Text>

        {/* Footer */}
        <View style={st.cardFooter}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={st.paginationText}>{index + 1} / {total}</Text>
            {item.sourceUrl ? (
              <Pressable
                onPress={() => Linking.openURL(item.sourceUrl!).catch(() => undefined)}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <View style={st.readOriginalBtn}>
                  <Feather name="external-link" size={11} color={colors.primary} />
                  <Text style={st.readOriginalText}>Source</Text>
                </View>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            style={({ pressed }) => [st.shareBtn, pressed && { opacity: 0.8 }]}
            onPress={() => onShare(item)}
          >
            <Feather name="share-2" size={15} color="#fff" />
            <Text style={st.shareBtnText}>Share</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function News() {
  const { data, loading, refreshing, error, reload, refresh } =
    useApi<NewsItem[]>("/news");
  const polls = useApi<PollListItem[]>("/polls");
  const { api } = useAuth();
  const [shareItem, setShareItem] = useState<NewsItem | null>(null);
  const flatRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  function handleShareDone(itemId: string) {
    void api(`/news/${itemId}/share`, { method: "POST" }).catch(() => undefined);
  }

  const items = data ?? [];

  function goNext() {
    if (currentIndex < items.length - 1) {
      flatRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    }
  }
  function goPrev() {
    if (currentIndex > 0) {
      flatRef.current?.scrollToIndex({ index: currentIndex - 1, animated: true });
    }
  }

  return (
    <View style={st.fill}>
      <View style={st.header}>
        <Text style={st.headerTitle}>News</Text>
        {!loading && (
          <View style={st.headerRight}>
            <Feather name="rss" size={16} color={colors.primary} />
            <Text style={st.headerSub}>{items.length} stories</Text>
          </View>
        )}
      </View>

      {loading && !data && (
        <View style={st.skeletonWrap}>
          {[0, 1].map((i) => (
            <View key={i} style={[st.card, st.skeletonCard, { width: CARD_W }]}>
              <View style={st.skeletonImg} />
              <View style={st.skeletonBody}>
                <View style={[st.skeletonLine, { width: "40%", height: 12 }]} />
                <View style={[st.skeletonLine, { width: "90%", height: 20, marginTop: 12 }]} />
                <View style={[st.skeletonLine, { width: "80%", height: 14, marginTop: 8 }]} />
                <View style={[st.skeletonLine, { width: "70%", height: 14, marginTop: 6 }]} />
              </View>
            </View>
          ))}
        </View>
      )}

      {error && !data && (
        <View style={st.errorWrap}>
          <Feather name="wifi-off" size={40} color={colors.textMuted} />
          <Text style={st.errorTitle}>Couldn't load news</Text>
          <Text style={st.errorMsg}>{error}</Text>
          <Pressable style={({ pressed }) => [st.retryBtn, pressed && { opacity: 0.75 }]} onPress={reload}>
            <Text style={st.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {items.length > 0 && (
        <>
          <FlatList
            ref={flatRef}
            data={items}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_W}
            decelerationRate="fast"
            bounces={false}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / CARD_W);
              setCurrentIndex(idx);
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={colors.primary}
              />
            }
            renderItem={({ item, index }) => (
              <NewsCard
                item={item}
                index={index}
                total={items.length}
                onShare={setShareItem}
              />
            )}
          />

          {/* Prev / Next nav */}
          <View style={st.navRow}>
            <Pressable
              style={({ pressed }) => [st.navBtn, currentIndex === 0 && st.navBtnDisabled, pressed && { opacity: 0.75 }]}
              onPress={goPrev}
              disabled={currentIndex === 0}
            >
              <Feather
                name="chevron-left"
                size={20}
                color={currentIndex === 0 ? colors.textMuted : "#fff"}
              />
              <Text
                style={[
                  st.navBtnText,
                  currentIndex === 0 && { color: colors.textMuted },
                ]}
              >
                Previous
              </Text>
            </Pressable>

            {/* Dots */}
            <View style={st.dots}>
              {items.slice(0, 8).map((_, i) => (
                <View
                  key={i}
                  style={[st.dot, i === currentIndex && st.dotActive]}
                />
              ))}
              {items.length > 8 && (
                <Text style={st.dotMore}>+{items.length - 8}</Text>
              )}
            </View>

            <Pressable
              style={({ pressed }) => [
                st.navBtn,
                currentIndex === items.length - 1 && st.navBtnDisabled,
                pressed && { opacity: 0.75 },
              ]}
              onPress={goNext}
              disabled={currentIndex === items.length - 1}
            >
              <Text
                style={[
                  st.navBtnText,
                  currentIndex === items.length - 1 && { color: colors.textMuted },
                ]}
              >
                Next
              </Text>
              <Feather
                name="chevron-right"
                size={20}
                color={
                  currentIndex === items.length - 1 ? colors.textMuted : "#fff"
                }
              />
            </Pressable>
          </View>
        </>
      )}

      {/* Active Polls */}
      {(polls.data ?? []).length > 0 && (
        <View style={st.pollsSection}>
          <Text style={st.pollsSectionTitle}>📊 Active Polls</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
            {(polls.data ?? []).map((p) => (
              <PollCard key={p.id} poll={p} onVoted={() => polls.reload()} />
            ))}
          </ScrollView>
        </View>
      )}

      {shareItem && (
        <ShareSheet
          item={shareItem}
          onClose={() => setShareItem(null)}
          onShareDone={() => handleShareDone(shareItem.id)}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#0d0d1a" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: "#0d0d1a",
  },
  headerTitle: { fontSize: 24, fontWeight: "700", color: "#fff", fontFamily, lineHeight: lh(24) },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerSub: { fontSize: 13, color: colors.textMuted, fontFamily, lineHeight: lh(13) },

  breakingBanner: {
    backgroundColor: "#DC2626",
    paddingHorizontal: 12,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
  },
  breakingText: { color: "#fff", fontSize: 12, fontWeight: "700", fontFamily, lineHeight: lh(12), letterSpacing: 0.5 },

  // Card
  card: {
    backgroundColor: "#111",
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: 8,
  },
  cardBody: { padding: 16 },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  handlePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: colors.primary + "44",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  handleText: { fontSize: 12, fontWeight: "700", color: colors.primary, fontFamily, lineHeight: lh(12) },
  timeText: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12) },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
    lineHeight: 24,
    marginBottom: 10,
    fontFamily,
  },
  cardBody2: { fontSize: 14, color: "#94a3b8", lineHeight: 22, fontFamily },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#222",
  },
  paginationText: { fontSize: 12, color: colors.textMuted, fontFamily, lineHeight: lh(12) },
  readOriginalBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderColor: colors.primary + "55",
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  readOriginalText: { fontSize: 11, color: colors.primary, fontFamily, lineHeight: lh(11) },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  shareBtnText: { fontSize: 13, fontWeight: "700", color: "#fff", fontFamily, lineHeight: lh(13) },

  // Navigation
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#000",
  },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: "#1a1a1a",
  },
  navBtnDisabled: { backgroundColor: "#111" },
  navBtnText: { fontSize: 13, fontWeight: "700", color: "#fff", fontFamily, lineHeight: lh(13) },
  dots: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#333",
  },
  dotActive: { backgroundColor: colors.primary, width: 18 },
  dotMore: { fontSize: 11, color: colors.textMuted, marginLeft: 2, fontFamily, lineHeight: lh(11) },

  // Skeleton
  skeletonWrap: { flex: 1, alignItems: "center", paddingTop: 8 },
  skeletonCard: { marginBottom: 0 },
  skeletonImg: { width: CARD_W, height: 220, backgroundColor: "#1e1e2e" },
  skeletonBody: { padding: 16 },
  skeletonLine: { backgroundColor: "#252540", borderRadius: 4 },

  // Error
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  errorTitle: { fontSize: 17, fontWeight: "700", color: "#fff", fontFamily, lineHeight: lh(17) },
  errorMsg: { fontSize: 14, color: colors.textMuted, textAlign: "center", fontFamily, lineHeight: lh(14) },
  retryBtn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  retryText: { color: "#fff", fontWeight: "700", fontFamily },

  // Share sheet
  sheetOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#111",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: 32,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#333",
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 20,
    textAlign: "center",
    fontFamily,
    lineHeight: lh(16),
  },
  sheetRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  sheetBtn: { alignItems: "center", gap: 8 },
  sheetIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetLabel: { fontSize: 12, color: "#94a3b8", fontWeight: "600", fontFamily, lineHeight: lh(12) },

  pollsSection: { paddingTop: 12, paddingBottom: 8 },
  pollsSectionTitle: { fontSize: 13, fontWeight: "700", color: colors.textMuted, paddingHorizontal: 16, marginBottom: 8, fontFamily, lineHeight: lh(13) },
  pollCard: { width: 240, backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border },
  pollQuestion: { fontSize: 14, fontWeight: "700", color: colors.text, fontFamily, lineHeight: lh(14) },
  pollOption: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: "hidden",
    position: "relative",
  },
  pollOptionChosen: { borderColor: colors.primary },
  pollBar: { position: "absolute", top: 0, left: 0, bottom: 0, backgroundColor: colors.primary + "22" },
  pollOptionText: { fontSize: 13, color: colors.text, fontFamily, lineHeight: lh(13), zIndex: 1 },
  pollOptionTextChosen: { color: colors.primary, fontWeight: "700" },
  pollMeta: { fontSize: 11, color: colors.textMuted, marginTop: 8, fontFamily, lineHeight: lh(11) },
});
