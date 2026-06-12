// Must be the very first import on native: registers gesture-handler before
// any component that uses it (sonner-native Toaster, reanimated). Missing this
// crashes a release APK to a blank white screen (web is a no-op, so web worked).
import "react-native-gesture-handler";
import "../src/i18n";
import { Component, useEffect, useRef, type ReactNode } from "react";
import { Platform, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Toaster } from "sonner-native";
import { AuthProvider, useAuth } from "../src/auth/auth-context";
import { checkOnboarded } from "../src/lib/onboarding";
import { colors, fontFamily } from "../src/theme";
import { useHandleDeepLink } from "../src/lib/deeplink";

/**
 * Root error boundary. A render/startup crash on native shows a blank white
 * screen in a release build (no red box). This catches it and renders the
 * actual error message instead, so the app is never silently blank.
 */
class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: colors.primaryDark, alignItems: "center", justifyContent: "center", padding: 28 }}>
          <Text style={{ color: colors.gold, fontSize: 18, fontWeight: "700", fontFamily, marginBottom: 12, textAlign: "center" }}>
            Something went wrong
          </Text>
          <Text style={{ color: "#fff", fontSize: 13, fontFamily, textAlign: "center", opacity: 0.85 }}>
            {this.state.error.message}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

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
    <RootErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AuthProvider>
            <StatusBar style="light" />
            <AppNavigator />
            <Toaster />
          </AuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </RootErrorBoundary>
  );
}
