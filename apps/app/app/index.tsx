import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../src/auth/auth-context";
import { checkOnboarded } from "../src/lib/onboarding";
import { colors } from "../src/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setOnboarded(null);
      return;
    }
    checkOnboarded().then(setOnboarded);
  }, [user]);

  // Show spinner while auth loads OR while we check onboarding for a logged-in user
  if (loading || (user !== null && onboarded === null)) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  if (!onboarded) return <Redirect href="/onboarding/welcome" />;
  return <Redirect href="/feed" />;
}
