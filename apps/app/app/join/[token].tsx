import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors } from "../../src/theme";

/**
 * Short shareable form of the invite URL (API mints WEB_APP_URL/join/<token>).
 * Redirects to the real accept page.
 */
export default function JoinRedirect() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(token ? `/accept-invite/${token}` : "/login");
  }, [token, router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
