import React from "react";
import { View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  HouseLine,
  ShareNetwork,
  Trophy,
  Users,
  UserCircle,
  Calendar,
  Newspaper,
  Bell,
  Megaphone,
} from "phosphor-react-native";
import { useAuth } from "../../src/auth/auth-context";
import { DrawerProvider } from "../../src/context/drawer-context";
import { AppHeader } from "../../src/components/AppHeader";
import { AppDrawer } from "../../src/components/AppDrawer";
import { colors, fontFamily } from "../../src/theme";

function makeHeader(title: string) {
  return function Header() {
    return <AppHeader title={title} />;
  };
}

export default function TabsLayout() {
  const { t, i18n } = useTranslation();
  const { user, loading } = useAuth();

  if (!loading && !user) return <Redirect href="/login" />;

  const lang = i18n.language as "te" | "en";

  return (
    <DrawerProvider>
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: true,
            tabBarActiveTintColor: colors.gold,
            tabBarInactiveTintColor: "#94a3b8",
            tabBarStyle: {
              backgroundColor: "#FFFFFF",
              borderTopColor: colors.gold,
              borderTopWidth: 2,
              shadowColor: colors.gold,
              shadowOpacity: 0.12,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: -2 },
              elevation: 8,
              height: 60,
              paddingBottom: 8,
              paddingTop: 6,
            },
            tabBarLabelStyle: { fontSize: 11, fontWeight: "700", fontFamily },
            tabBarIconStyle: { marginBottom: 0 },
          }}
        >
          {/* ── 5 visible tabs ── */}
          <Tabs.Screen
            name="feed"
            options={{
              title: t("feed.title"),
              tabBarIcon: ({ focused, color }) => (
                <ShareNetwork weight={focused ? "duotone" : "regular"} size={24} color={color} />
              ),
              header: makeHeader(t("feed.title")),
            }}
          />
          <Tabs.Screen
            name="news"
            options={{
              title: lang === "te" ? "వార్తలు" : "News",
              tabBarIcon: ({ focused, color }) => (
                <Newspaper weight={focused ? "duotone" : "regular"} size={24} color={color} />
              ),
              header: makeHeader(lang === "te" ? "వార్తలు" : "News"),
            }}
          />
          <Tabs.Screen
            name="events"
            options={{
              title: t("events.title"),
              tabBarIcon: ({ focused, color }) => (
                <Calendar weight={focused ? "duotone" : "regular"} size={24} color={color} />
              ),
              header: makeHeader(t("events.title")),
            }}
          />
          <Tabs.Screen
            name="leaderboard"
            options={{
              title: t("leaderboard.title"),
              tabBarIcon: ({ focused, color }) => (
                <Trophy weight={focused ? "duotone" : "regular"} size={24} color={color} />
              ),
              header: makeHeader(t("leaderboard.title")),
            }}
          />
          <Tabs.Screen
            name="team"
            options={{
              title: lang === "te" ? "నా బృందం" : "My Team",
              tabBarIcon: ({ focused, color }) => (
                <Users weight={focused ? "duotone" : "regular"} size={24} color={color} />
              ),
              header: makeHeader(lang === "te" ? "నా బృందం" : "My Team"),
              href: user?.isLeader ? undefined : null,
            }}
          />

          {/* ── Hidden from tab bar — accessible via drawer ── */}
          <Tabs.Screen
            name="updates"
            options={{
              href: null,
              header: makeHeader(lang === "te" ? "అప్‌డేట్లు" : "Updates"),
            }}
          />
          <Tabs.Screen
            name="grievances"
            options={{
              href: null,
              header: makeHeader(t("grievances.title")),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              href: null,
              header: makeHeader(t("profile.title")),
            }}
          />
        </Tabs>

        {/* Drawer overlay — sits above tabs + tab bar */}
        <AppDrawer />
      </View>
    </DrawerProvider>
  );
}
