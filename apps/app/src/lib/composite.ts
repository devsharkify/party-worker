// Shared types + the "neither web nor native" fallback. Web uses composite.web.ts
// (canvas redraw); native uses composite.native.ts (react-native-view-shot capture
// of the rendered preview, via the passed view ref).
export interface CompositeInput {
  sourceUrl: string;
  photoUrl?: string | null;
  name: string;
  designation?: string | null;
  booth: string;
  aiLabel: string;
}

export async function captureComposite(
  _input: CompositeInput,
  _viewRef?: unknown,
): Promise<string | null> {
  return null;
}
