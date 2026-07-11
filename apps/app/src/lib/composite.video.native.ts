// NATIVE video compositing. This is the file Metro loads on iOS/Android
// (the `.native` suffix wins over the bare `.ts`). The share screen's banner
// burn-in MUST live here, not in composite.video.ts, or it resolves to
// undefined on device.
import { FFmpegKit, ReturnCode } from "ffmpeg-kit-react-native";
import * as FileSystem from "expo-file-system/legacy";

export type { VideoCompositeInput } from "./composite.video.web";

// Legacy per-frame personalization (used by personalize/[id].tsx). Native has
// no canvas/MediaRecorder, so the personalize flow falls back to a thumbnail.
export async function captureVideoComposite(): Promise<string | null> {
  return null;
}

/**
 * On-device banner burn-in. Downloads the source reel, overlays the worker
 * banner PNG at `bottomRatio` up from the bottom, re-encodes to H.264 so
 * WhatsApp / Instagram accept it, and returns the local MP4 path.
 *
 * scale2ref scales the banner to the actual video width (works for 720/1080/
 * 1440 reels). `-loop 1` keeps the still banner for the whole clip (without it
 * overlay+shortest collapses output to a single 0.03s frame). Audio is mapped
 * optionally so silent reels still composite.
 */
export async function compositeVideoWithBanner(
  videoUrl: string,
  bannerPngUri: string,
  cacheKey: string,
  bottomRatio = 0.15,
  maxDurationSec?: number,
): Promise<string> {
  const videoPath = `${FileSystem.cacheDirectory}cv_in_${cacheKey}.mp4`;
  const outPath = `${FileSystem.cacheDirectory}cv_out_${cacheKey}.mp4`;

  // Every share mints a new shareEventId → cacheKey, so cv_* files pile up
  // (20-80MB each) on the low-storage devices this base carries. Sweep old
  // ones before we add another pair. Best-effort — never block the share.
  await sweepStaleComposites(cacheKey);

  const dl = await FileSystem.downloadAsync(videoUrl, videoPath);
  if (dl.status >= 400) {
    throw new Error(`Video download failed (HTTP ${dl.status}).`);
  }

  const bannerPath = bannerPngUri.replace(/^file:\/\//, "");
  const videoLocalPath = videoPath.replace(/^file:\/\//, "");
  const outLocalPath = outPath.replace(/^file:\/\//, "");

  const yExpr = `H*${(1 - bottomRatio).toFixed(4)}-h`;
  const filter =
    `[1:v][0:v]scale2ref=w=iw:h=ow/mdar[bnr][vid];` +
    `[vid][bnr]overlay=0:${yExpr}:shortest=1[outv]`;
  const cmd = [
    `-i "${videoLocalPath}"`,
    `-loop 1 -i "${bannerPath}"`,
    `-filter_complex "${filter}"`,
    ...(maxDurationSec ? [`-t ${maxDurationSec}`] : []),
    `-map "[outv]"`,
    `-map 0:a:0?`,
    // The 16KB ffmpeg-kit fork is built --enable-libopenh264 (NOT libx264 —
    // x264 is GPL and absent, so `-c:v libx264` fails with "Unknown encoder").
    // libopenh264 is software H.264 (consistent across the cheap devices this
    // base carries, unlike the flaky h264_mediacodec encoder). It has no
    // preset/crf — drive quality via bitrate. Default profile is
    // constrained-baseline (max compatibility); don't pass -profile:v
    // "baseline" — openh264 rejects that token (x264-ism), it wants
    // "constrained_baseline"/"main"/"high".
    `-c:v libopenh264`,
    `-b:v 5M`,
    `-pix_fmt yuv420p`,
    `-c:a aac`,
    `-b:a 128k`,
    `-y "${outLocalPath}"`,
  ].join(" ");

  const session = await FFmpegKit.execute(cmd);
  const rc = await session.getReturnCode();

  if (!ReturnCode.isSuccess(rc)) {
    const logs = await session.getOutput();
    throw new Error(`Video compositing failed: ${logs?.slice(-400) ?? "unknown"}`);
  }

  // The downloaded source reel is no longer needed once encoded. Keep the
  // output — the caller reads it right after — and let the next sweep clear it.
  await FileSystem.deleteAsync(videoPath, { idempotent: true }).catch(() => {});

  return outPath;
}

/** Delete cv_in_/cv_out_ leftovers from prior shares, keeping the current cacheKey's pair. */
async function sweepStaleComposites(keepKey: string): Promise<void> {
  try {
    const dir = FileSystem.cacheDirectory;
    if (!dir) return;
    const names = await FileSystem.readDirectoryAsync(dir);
    await Promise.all(
      names
        .filter((n) => (n.startsWith("cv_in_") || n.startsWith("cv_out_")) && !n.includes(keepKey))
        .map((n) => FileSystem.deleteAsync(`${dir}${n}`, { idempotent: true }).catch(() => {})),
    );
  } catch {
    // best-effort cleanup; never block a share
  }
}
