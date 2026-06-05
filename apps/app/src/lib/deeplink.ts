import { useEffect } from "react";
import { Linking } from "react-native";
import { useRouter } from "expo-router";

/**
 * Extracts an invite token from a deep link URL.
 *
 * Supports:
 *   https://partyworker.app/invite/TOKEN
 *   partyworker://invite/TOKEN
 *   partyworker://accept-invite/TOKEN  (Expo Router path)
 */
export function getInviteTokenFromUrl(url: string): string | null {
  try {
    // Normalise both custom-scheme and https links into a parseable form.
    // The URL constructor can't handle custom schemes like partyworker:// on all
    // runtimes, so we normalise them to https first.
    const normalised = url.replace(/^partyworker:\/\//, "https://partyworker.app/");
    const parsed = new URL(normalised);

    // Match /invite/TOKEN or /accept-invite/TOKEN
    const match = parsed.pathname.match(/^\/(?:invite|accept-invite)\/([^/?#]+)/);
    if (match?.[1]) return match[1];
    return null;
  } catch {
    return null;
  }
}

/**
 * Root-layout hook: listens for incoming deep links (cold and warm start) and
 * navigates to the accept-invite screen when an invite URL is detected.
 *
 * Call this once inside the root layout component — it registers/removes the
 * Linking listener automatically via React effects.
 */
export function useHandleDeepLink(): void {
  const router = useRouter();

  function handleUrl(url: string | null) {
    if (!url) return;
    const token = getInviteTokenFromUrl(url);
    if (token) {
      router.push(`/accept-invite/${token}`);
    }
  }

  useEffect(() => {
    // Handle the URL that launched the app (cold start).
    void Linking.getInitialURL().then(handleUrl);

    // Handle URLs received while the app is already open (warm start).
    const sub = Linking.addEventListener("url", (event) => {
      handleUrl(event.url);
    });

    return () => {
      sub.remove();
    };
    // router is stable across renders; eslint exhaustive-deps isn't relevant here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
