// Native (iOS/Android): capture the rendered personalize preview View into a PNG
// data URL via react-native-view-shot, so the shared image is the real composite.
// (Web uses composite.web.ts; this file is never bundled for web.)
import { captureRef } from "react-native-view-shot";
import type { CompositeInput } from "./composite";

export type { CompositeInput };

export async function captureComposite(
  _input: CompositeInput,
  viewRef?: unknown,
): Promise<string | null> {
  if (!viewRef) return null;
  try {
    // Give the preview's background image + photo a moment to render before snapshot.
    await new Promise((r) => setTimeout(r, 450));
    // result:"data-uri" returns "data:image/png;base64,..." which the API's
    // /feed/:id/render endpoint accepts and stores.
    const uri = await captureRef(viewRef as never, {
      format: "png",
      quality: 0.92,
      result: "data-uri",
    });
    return uri ?? null;
  } catch {
    return null;
  }
}
