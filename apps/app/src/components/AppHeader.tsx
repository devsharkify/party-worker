import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useAuth } from "../auth/auth-context";
import { useDrawer } from "../context/drawer-context";
import { RemoteImage } from "./RemoteImage";
import { TRSLogo } from "./TRSLogo";
import { colors, fontFamily, fontWeight, lh, shadow } from "../theme";

function HeaderContent({ title }: { title?: string }) {
  const { toggle } = useDrawer();
  const { user } = useAuth();
  const router = useRouter();

  return (
    <>
      {/* Hamburger */}
      <Pressable onPress={toggle} style={({ pressed }) => [st.iconBtn, pressed && { opacity: 0.75 }]} hitSlop={8}>
        <Feather name="menu" size={22} color="#fff" />
      </Pressable>

      {/* Brand + Title */}
      <View style={st.titleRow}>
        <TRSLogo size={28} showBanner={false} borderRadius={3} />
        <Text style={st.title} numberOfLines={1}>
          {title ?? "myTRS"}
        </Text>
      </View>

      {/* Right: bell + avatar */}
      <View style={st.right}>
        <Pressable
          onPress={() => router.push("/(tabs)/updates")}
          style={({ pressed }) => [st.iconBtn, pressed && { opacity: 0.75 }]}
          hitSlop={8}
        >
          <Feather name="bell" size={20} color="#fff" />
        </Pressable>

        <Pressable
          onPress={() => router.push("/(tabs)/profile")}
          style={({ pressed }) => [st.avatarBtn, pressed && { opacity: 0.75 }]}
          hitSlop={4}
        >
          {user?.photoUrl ? (
            <RemoteImage uri={user.photoUrl} width={32} height={32} radius={16} placeholderColor={colors.primaryDark} />
          ) : (
            <View style={st.avatarFallback}>
              <Text style={st.avatarInitial}>
                {user?.name?.charAt(0)?.toUpperCase() ?? "?"}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </>
  );
}

export function AppHeader({ title }: { title?: string }) {
  if (Platform.OS !== "web") {
    return (
      <BlurView tint="dark" intensity={80} style={[st.bar, { overflow: "hidden" }]}>
        <View style={st.pinkOverlay} pointerEvents="none" />
        <HeaderContent title={title} />
      </BlurView>
    );
  }

  return (
    <View style={st.bar}>
      <HeaderContent title={title} />
    </View>
  );
}

const st = StyleSheet.create({
  bar: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: colors.gold,
    ...shadow,
    gap: 10,
  },
  pinkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#E91E8C",
    opacity: 0.85,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  brandDot: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: fontWeight.heavy,
    fontFamily,
    lineHeight: lh(14),
  },
  title: {
    color: "#fff",
    fontSize: 17,
    fontWeight: fontWeight.bold,
    textAlign: "center",
    fontFamily,
    lineHeight: lh(17),
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  avatarBtn: {
    marginLeft: 4,
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.gold,
  },
  avatarInitial: {
    color: "#fff",
    fontSize: 14,
    fontWeight: fontWeight.bold,
    fontFamily,
    lineHeight: lh(14),
  },
});
