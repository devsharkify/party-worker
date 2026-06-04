// Native placeholder: real on-device capture needs a native module
// (react-native-view-shot / Skia). For now native reports a preview-only render;
// the web implementation (composite.web.ts) produces a real uploadable PNG.
export interface CompositeInput {
  sourceUrl: string;
  photoUrl?: string | null;
  name: string;
  designation?: string | null;
  booth: string;
  aiLabel: string;
}

export async function captureComposite(_input: CompositeInput): Promise<string | null> {
  return null;
}
