import "../src/i18n";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Toaster } from "sonner-native";
import { AuthProvider, useAuth } from "../src/auth/auth-context";
import { checkOnboarded } from "../src/lib/onboarding";
import { colors } from "../src/theme";
import { useHandleDeepLink } from "../src/lib/deeplink";

/**
 * Runs inside the navigator (so useRouter is valid) and inside AuthProvider.
 * After the user is authenticated it checks AsyncStorage for the onboarding
 * flag — if absent, it redirects to the onboarding flow exactly once.
 */
function OnboardingGuard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (loading || !user || redirectedRef.current) return;

    // Small delay (1 s) to let the navigator finish rendering before replacing
    const timer = setTimeout(async () => {
      if (redirectedRef.current) return;
      const onboarded = await checkOnboarded();
      if (!onboarded) {
        redirectedRef.current = true;
        router.replace("/onboarding/welcome");
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [user, loading, router]);

  return null;
}

/** Inner component rendered inside the navigator so useRouter() is available. */
function AppNavigator() {
  useHandleDeepLink();
  return (
    <>
      <OnboardingGuard />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === "web") {
      import("../src/lib/offline").then((m) => m.registerServiceWorker());
    }
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <AppNavigator />
        <Toaster />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
