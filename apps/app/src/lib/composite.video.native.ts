// Native video personalization stub.
// Full frame-by-frame video recording requires a native module (e.g. FFmpegKit).
// For now, native devices get a high-quality thumbnail frame captured via
// react-native-view-shot from the preview View (same as image personalization).
// The actual video file is the HQ source — only the shared thumbnail is personalized.

export type { VideoCompositeInput } from "./composite.video.web";

export async function captureVideoComposite(): Promise<string | null> {
  // Not supported on native without a native video encoding module.
  return null;
}
