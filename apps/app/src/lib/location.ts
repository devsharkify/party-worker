import { Platform } from "react-native";

export interface Position {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

/** Thrown message when the user denied the OS location permission. */
export const PERMISSION_DENIED = "permission-denied";

/** Current position — web: navigator.geolocation; native: expo-location. */
export async function getPosition(): Promise<Position> {
  if (Platform.OS === "web") {
    return new Promise<Position>((resolve, reject) => {
      if (!navigator?.geolocation) {
        reject(new Error(PERMISSION_DENIED));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? undefined,
          }),
        (err) =>
          reject(new Error(err?.code === 1 ? PERMISSION_DENIED : err?.message || "geolocation failed")),
        { enableHighAccuracy: true, timeout: 15000 },
      );
    });
  }
  const Location = await import("expo-location");
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") throw new Error(PERMISSION_DENIED);
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? undefined,
  };
}
