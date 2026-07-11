// Must be the very first import on native: registers gesture-handler before
// any component that uses it (sonner-native Toaster, reanimated). Missing this
// crashes a release APK to a blank white screen (web is a no-op, so web worked).
import "react-native-gesture-handler";
import "../src/i18n";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Toaster } from "sonner-native";
import { AuthProvider, useAuth } from "../src/auth/auth-context";
import { checkOnboarded, markOnboarded } from "../src/lib/onboarding";
import { colors, fontFamily, fontWeight, radius, shadow } from "../src/theme";
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
 * Redirects to onboarding only for a genuinely new user.
 *
 * Onboarding status is SERVER-AUTHORITATIVE: if the user's profile already has
 * constituency + area (set during setup-profile), they've onboarded — even on a
 * fresh install or a new device where the local flag is missing. The local flag
 * is only a fast-path cache. This is why a returning user is never asked for
 * their details (name/constituency/DOB) a second time.
 */
function OnboardingGuard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (loading || !user || redirectedRef.current) return;
    void (async () => {
      if (redirectedRef.current) return;
      const profileComplete = Boolean(user.constituency && user.area);
      const flag = await checkOnboarded();
      if (profileComplete || flag) {
        // Returning user — make the local cache consistent and never redirect.
        if (profileComplete && !flag) await markOnboarded();
        return;
      }
      // Genuinely new user — collect details once.
      redirectedRef.current = true;
      router.replace("/onboarding/welcome");
    })();
  }, [user, loading, router]);

  return null;
}

/**
 * Soft modal prompting new workers to add a profile photo.
 * Only fires on native, only when photoUrl is absent, only once per session,
 * and only after onboarding is complete (so it doesn't compete with that flow).
 */
function PhotoGateModal() {
  const { user, api, refreshUser } = useAuth();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!user || user.photoUrl || shownRef.current) return;
    void (async () => {
      const onboarded = await checkOnboarded();
      if (!onboarded || shownRef.current) return;
      shownRef.current = true;
      setVisible(true);
    })();
  }, [user]);

  async function upload() {
    if (busy) return;
    try {
      const ImagePicker = await import("expo-image-picker");
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"] as any,
        allowsEditing: true,
        aspect: [1, 1] as [number, number],
        quality: 0.9,
      });
      const asset = res.assets?.[0];
      if (res.canceled || !asset) return;
      setBusy(true);
      const { manipulateAsync, SaveFormat } = await import("expo-image-manipulator");
      const out = await manipulateAsync(asset.uri, [{ resize: { width: 512 } }], {
        compress: 0.88,
        format: SaveFormat.JPEG,
        base64: true,
      });
      await api("/users/me/photo", {
        method: "POST",
        body: JSON.stringify({ dataUrl: `data:image/jpeg;base64,${out.base64}` }),
      });
      await refreshUser();
      setVisible(false);
    } catch {
      setVisible(false);
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setVisible(false)}>
      <View style={pg.backdrop}>
        <View style={pg.card}>
          <Text style={pg.emoji}>📸</Text>
          <Text style={pg.title}>Add your photo</Text>
          <Text style={pg.body}>
            Workers with a profile photo are recognised faster by voters and leaders. It only takes a moment.
          </Text>
          <Pressable
            style={({ pressed }) => [pg.btn, pressed && { opacity: 0.82 }, busy && { opacity: 0.6 }]}
            onPress={upload}
            disabled={busy}
          >
            {busy
              ? <ActivityIndicator color="#fff" />
              : <Text style={pg.btnText}>Upload Photo</Text>}
          </Pressable>
          <Pressable onPress={() => setVisible(false)} style={pg.skip}>
            <Text style={pg.skipText}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const pg = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    padding: 28,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    ...shadow,
  },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: {
    fontSize: 22,
    fontWeight: fontWeight.bold,
    color: colors.text,
    fontFamily,
    marginBottom: 10,
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    color: colors.textMuted,
    fontFamily,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 52,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  btnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: fontWeight.bold,
    fontFamily,
  },
  skip: { paddingVertical: 8 },
  skipText: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily,
  },
});

/** Inner component rendered inside the navigator so useRouter() is available. */
function AppNavigator() {
  useHandleDeepLink();
  return (
    <>
      <OnboardingGuard />
      <PhotoGateModal />
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
