import { FFmpegKit, ReturnCode } from "ffmpeg-kit-react-native";
import * as FileSystem from "expo-file-system/legacy";

/**
 * On-device video compositing — downloads the source video, overlays the
 * worker banner PNG at `bottomRatio` from the bottom of the frame, and
 * returns the local path of the composited MP4.
 *
 * The banner is scaled to 1080px wide (matching standard Reel resolution).
 * Uses libx264 ultrafast preset — typically 10-40s on a mid-range phone for
 * a 30-second clip.
 */
export async function compositeVideoWithBanner(
  videoUrl: string,
  bannerPngUri: string,
  cacheKey: string,
  bottomRatio = 0.15,
): Promise<string> {
  const videoPath = `${FileSystem.cacheDirectory}cv_in_${cacheKey}.mp4`;
  const outPath = `${FileSystem.cacheDirectory}cv_out_${cacheKey}.mp4`;

  // Download source video to local cache
  await FileSystem.downloadAsync(videoUrl, videoPath);

  // Strip file:// prefix — ffmpeg-kit expects absolute paths on Android
  const bannerPath = bannerPngUri.replace(/^file:\/\//, "");
  const videoLocalPath = videoPath.replace(/^file:\/\//, "");

  // Scale banner to 1080px wide, overlay at bottomRatio% from bottom.
  // H = video height, h = scaled banner height.
  // y = H * (1 - bottomRatio) - h  →  banner top sits (bottomRatio)% above the bottom.
  const yExpr = `H*${(1 - bottomRatio).toFixed(4)}-h`;
  const cmd = [
    `-i "${videoLocalPath}"`,
    `-i "${bannerPath}"`,
    `-filter_complex "[1:v]scale=1080:-1[b];[0:v][b]overlay=0:${yExpr}:shortest=1"`,
    `-c:v libx264`,
    `-preset ultrafast`,
    `-crf 23`,
    `-c:a copy`,
    `-y "${outPath}"`,
  ].join(" ");

  const session = await FFmpegKit.execute(cmd);
  const rc = await session.getReturnCode();

  if (!ReturnCode.isSuccess(rc)) {
    const logs = await session.getOutput();
    throw new Error(`Video compositing failed: ${logs?.slice(-400) ?? "unknown"}`);
  }

  return outPath;
}
