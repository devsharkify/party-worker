import React from "react";
import { Text } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../src/auth/auth-context";
import { colors } from "../../src/theme";

const icon = (ch: string) =>
  function TabIcon({ color }: { color: string }) {
    return <Text style={{ fontSize: 20, color }}>{ch}</Text>;
  };

export default function TabsLayout() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();

  if (!loading && !user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "800" },
        tabBarActiveTintColor: colors.primaryDark,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen name="feed" options={{ title: t("feed.title"), tabBarIcon: icon("🏠") }} />
      <Tabs.Screen
        name="leaderboard"
        options={{ title: t("leaderboard.title"), tabBarIcon: icon("🏆") }}
      />
      <Tabs.Screen name="profile" options={{ title: t("profile.title"), tabBarIcon: icon("👤") }} />
    </Tabs>
  );
}
