import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_KEY = "@pw:onboarded";

/**
 * Returns true if the user has already completed onboarding.
 */
export async function checkOnboarded(): Promise<boolean> {
  const val = await AsyncStorage.getItem(ONBOARDING_KEY);
  return val === "true";
}

/**
 * Marks onboarding as completed in AsyncStorage.
 */
export async function markOnboarded(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_KEY, "true");
}
