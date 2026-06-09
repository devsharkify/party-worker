import { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../auth/auth-context";
import { useDrawer } from "../context/drawer-context";
import { RemoteImage } from "./RemoteImage";
import { colors, fontFamily, fontWeight, lh, radius, shadow } from "../theme";

const SCREEN_W = Dimensions.get("window").width;
const DRAWER_W = Math.min(300, SCREEN_W * 0.8);

type FeatherName = React.ComponentProps<typeof Feather>["name"];

interface DrawerItem {
  label: string;
  labelTe: string;
  icon: FeatherName;
  href: string;
}

const ITEMS: DrawerItem[] = [
  { label: "Updates", labelTe: "అప్‌డేట్లు", icon: "bell", href: "/(tabs)/updates" },
  { label: "Grievances", labelTe: "ఫిర్యాదులు", icon: "alert-circle", href: "/(tabs)/grievances" },
  { label: "My Videos", labelTe: "నా వీడియోలు", icon: "film", href: "/my-videos" },
  { label: "Profile", labelTe: "ప్రొఫైల్", icon: "user", href: "/(tabs)/profile" },
];

export function AppDrawer() {
  const { isOpen, close } = useDrawer();
  const { user } = useAuth();
  const router = useRouter();
  const slideX = useRef(new Animated.Value(-DRAWER_W)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.spring(slideX, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 14 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideX, { toValue: -DRAWER_W, duration: 220, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [isOpen, slideX, opacity]);

  function navigate(href: string) {
    close();
    setTimeout(() => router.push(href as never), 50);
  }

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: isOpen ? "auto" : "none" } as never]}>
      {/* Scrim */}
      <Animated.View style={[st.scrim, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View style={[st.panel, { transform: [{ translateX: slideX }] }]}>
        {/* User card at top */}
        <View style={st.userCard}>
          {user?.photoUrl ? (
            <RemoteImage uri={user.photoUrl} width={52} height={52} radius={26} placeholderColor={colors.primaryDark} />
          ) : (
            <View style={st.avatarCircle}>
              <Text style={st.avatarInitial}>{user?.name?.charAt(0)?.toUpperCase() ?? "?"}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={st.userName} numberOfLines={1}>{user?.name ?? "—"}</Text>
            <Text style={st.userRole} numberOfLines={1}>{user?.orgUnitName ?? user?.role ?? ""}</Text>
          </View>
        </View>

        <View style={st.divider} />

        {/* Nav items */}
        {ITEMS.map((item) => (
          <Pressable
            key={item.href}
            onPress={() => navigate(item.href)}
            style={({ pressed }) => [st.item, pressed && st.itemPressed]}
          >
            <View style={st.itemIcon}>
              <Feather name={item.icon} size={18} color={colors.gold} />
            </View>
            <View>
              <Text style={st.itemLabel}>{item.label}</Text>
              <Text style={st.itemLabelTe}>{item.labelTe}</Text>
            </View>
          </Pressable>
        ))}

        <View style={st.divider} />

        {/* App name at bottom */}
        <View style={st.appBrand}>
          <Feather name="star" size={16} color={colors.gold} />
          <Text style={st.appName}>myTRS</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.60)",
  },
  panel: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_W,
    backgroundColor: colors.navy,
    borderRightWidth: 3,
    borderRightColor: colors.primary,
    paddingTop: 52,
    paddingBottom: 24,
    ...shadow,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 68,
    backgroundColor: colors.navyDark,
    marginTop: -52,
    marginBottom: 0,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: colors.gold,
  },
  avatarInitial: { color: "#fff", fontSize: 20, fontWeight: fontWeight.bold, fontFamily: fontFamily, lineHeight: lh(20) },
  userName: { color: "#fff", fontSize: 16, fontWeight: fontWeight.bold, fontFamily: fontFamily, lineHeight: lh(16) },
  userRole: { color: colors.textMutedOnDark, fontSize: 12, marginTop: 2, fontFamily: fontFamily, lineHeight: lh(12) },
  divider: { height: 1, backgroundColor: colors.borderOnDark, marginVertical: 8 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  itemPressed: { backgroundColor: "rgba(233,30,140,0.15)" },
  itemIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: "rgba(233,30,140,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  itemLabel: { color: "#fff", fontSize: 15, fontWeight: fontWeight.semibold, fontFamily: fontFamily, lineHeight: lh(15) },
  itemLabelTe: { color: colors.textMutedOnDark, fontSize: 11, marginTop: 1, fontFamily: fontFamily, lineHeight: lh(11) },
  appBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  appName: { color: colors.gold, fontSize: 14, fontWeight: fontWeight.bold, fontFamily: fontFamily, lineHeight: lh(14) },
});
