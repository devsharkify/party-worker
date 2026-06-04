import { Platform } from "react-native";

// On web we talk to the API on localhost; native devices/emulators override via env.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "web" ? "http://localhost:4000" : "http://localhost:4000");

export const isWeb = Platform.OS === "web";
