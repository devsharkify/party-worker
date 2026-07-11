import { FFmpegKit, ReturnCode } from "ffmpeg-kit-react-native";
import * as FileSystem from "expo-file-system/legacy";

/**
 * On-device video compositing — downloads the source video, overlays the
 * worker banner PNG at `bottomRatio` from the bottom of the frame, and
 * returns the local path of the composited MP4.
 *
 * Banner is scaled to the actual video width (scale2ref) and placed
 * bottomRatio% up from the bottom — works for 720/1080/1440-wide reels alike.
 * Re-encodes video with libx264 + audio to AAC so WhatsApp / Instagram accept
 * it; silent reels still composite (audio mapping is optional).
 */
export async function compositeVideoWithBanner(
  videoUrl: string,
  bannerPngUri: string,
  cacheKey: string,
  bottomRatio = 0.15,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _maxDurationSec?: number,
): Promise<string> {
  const videoPath = `${FileSystem.cacheDirectory}cv_in_${cacheKey}.mp4`;
  const outPath = `${FileSystem.cacheDirectory}cv_out_${cacheKey}.mp4`;

  await FileSystem.downloadAsync(videoUrl, videoPath);

  // ffmpeg-kit wants bare absolute paths, not file:// URIs
  const bannerPath = bannerPngUri.replace(/^file:\/\//, "");
  const videoLocalPath = videoPath.replace(/^file:\/\//, "");
  const outLocalPath = outPath.replace(/^file:\/\//, "");

  // scale2ref scales the banner ([1:v]) to the video's ([0:v]) width, keeping
  // its aspect ratio, so it spans the frame on any source size. Then overlay at
  // y = H*(1-bottomRatio) - bannerHeight (bottomRatio up from the bottom edge).
  const yExpr = `H*${(1 - bottomRatio).toFixed(4)}-h`;
  const filter =
    `[1:v][0:v]scale2ref=w=iw:h=ow/mdar[bnr][vid];` +
    `[vid][bnr]overlay=0:${yExpr}:shortest=1[outv]`;
  const cmd = [
    `-i "${videoLocalPath}"`,
    // -loop 1: the banner is a single still image. Without it, overlay+shortest
    // ends the output the instant the image "ends" → a 1-frame (0.03s) clip.
    `-loop 1 -i "${bannerPath}"`,
    `-filter_complex "${filter}"`,
    // map the OVERLAID video (not 0:v:0, which is the raw input) + optional
    // audio (the `?` makes a silent reel still composite)
    `-map "[outv]"`,
    `-map 0:a:0?`,
    `-c:v libx264`,
    `-preset ultrafast`,
    `-crf 23`,
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

  return outPath;
}
