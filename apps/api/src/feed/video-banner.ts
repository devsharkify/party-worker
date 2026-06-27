import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

// Worker banner is a 1080-wide strip; videos/creatives are authored at 1080 wide.
const TARGET_W = 1080;
// Cap the encode so a runaway/huge clip can't pin the box. ponytail: synchronous
// encode with a hard ceiling; move to the BullMQ "jobs" queue if long clips time out.
const FFMPEG_TIMEOUT_MS = 180_000;

/**
 * Overlay a pre-rendered banner PNG onto the bottom of a video and return the
 * re-encoded MP4. The banner is rendered on-device (real fonts/photo/Telugu),
 * so the server only does the one thing native RN can't: re-encode the video.
 */
export async function overlayBannerOnVideo(videoBuf: Buffer, bannerPng: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "vidbanner-"));
  const inVideo = join(dir, "in.mp4");
  const inBanner = join(dir, "banner.png");
  const out = join(dir, "out.mp4");
  try {
    await writeFile(inVideo, videoBuf);
    await writeFile(inBanner, bannerPng);
    await run(
      "ffmpeg",
      [
        "-y",
        "-i", inVideo,
        "-i", inBanner,
        // Normalise both to 1080 wide, pin the banner over the bottom of the frame.
        "-filter_complex",
        `[0:v]scale=${TARGET_W}:-2[v];[1:v]scale=${TARGET_W}:-2[b];[v][b]overlay=0:main_h-overlay_h[outv]`,
        "-map", "[outv]",
        "-map", "0:a?", // optional audio — clips without an audio track still encode
        "-c:a", "copy",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        out,
      ],
      { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 1 << 24 },
    );
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
