// Web video personalization: composites HQ video + worker identity overlay using
// Canvas API + MediaRecorder. Returns a base64 webm/mp4 data URL, or null on failure.

export interface VideoCompositeInput {
  sourceUrl: string;
  photoUrl?: string | null;
  name: string;
  designation?: string | null;
  booth: string;
  aiLabel: string;
  /** cap recording at this many seconds (defaults to 60) */
  maxDurationSec?: number;
  /** called with 0-1 progress as recording proceeds */
  onProgress?: (p: number) => void;
}

const W = 1080;
const H = 1920;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`img load failed: ${url}`));
    img.src = url;
  });
}

function getSupportedMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((t) => {
    try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
  }) ?? "video/webm";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function drawCoverFromEl(
  ctx: CanvasRenderingContext2D,
  el: HTMLVideoElement | HTMLImageElement,
  dx: number, dy: number, dw: number, dh: number,
) {
  const iw = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
  const ih = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
  if (!iw || !ih) { ctx.drawImage(el, dx, dy, dw, dh); return; }
  const ir = iw / ih;
  const dr = dw / dh;
  let sw: number, sh: number, sx: number, sy: number;
  if (ir > dr) {
    sh = ih; sw = sh * dr; sx = (iw - sw) / 2; sy = 0;
  } else {
    sw = iw; sh = sw / dr; sx = 0; sy = (ih - sh) / 2;
  }
  ctx.drawImage(el, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  input: VideoCompositeInput,
  photoImg: HTMLImageElement | null,
) {
  // Bottom scrim
  const grad = ctx.createLinearGradient(0, H * 0.5, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.68)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, H * 0.5, W, H * 0.5);

  // Worker photo (circular)
  const photo = 190;
  const px = 64;
  const py = Math.round(H * 0.72);
  if (photoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(px + photo / 2, py + photo / 2, photo / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    drawCoverFromEl(ctx, photoImg, px, py, photo, photo);
    ctx.restore();
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(px + photo / 2, py + photo / 2, photo / 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Name / designation / booth text
  const tx = px + photo + 44;
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 66px sans-serif";
  ctx.fillText(input.name, tx, py + 74, W - tx - 40);
  ctx.shadowBlur = 0;
  if (input.designation) {
    ctx.fillStyle = "#ffd54a";
    ctx.font = "700 42px sans-serif";
    ctx.fillText(input.designation, tx, py + 132, W - tx - 40);
  }
  ctx.fillStyle = "#ffffff";
  ctx.font = "500 40px sans-serif";
  ctx.fillText(input.booth, tx, py + 188, W - tx - 40);

  // Non-removable AI label band (>=7% area, IT Rules 2025)
  const bandH = Math.round(H * 0.07);
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(0, H - bandH, W, bandH);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 32px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(input.aiLabel, W / 2, H - bandH / 2 + 11);
  ctx.textAlign = "left";
}

export async function captureVideoComposite(input: VideoCompositeInput): Promise<string | null> {
  if (typeof document === "undefined") return null;
  if (typeof MediaRecorder === "undefined") return null;

  const mimeType = getSupportedMimeType();
  const maxSec = input.maxDurationSec ?? 60;

  // Off-screen canvas
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Hidden video element
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.src = input.sourceUrl;
  video.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:-9999px";
  document.body.appendChild(video);

  try {
    // Wait for video metadata + enough data to play
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("video load timeout")), 20_000);
      video.oncanplay = () => { clearTimeout(t); resolve(); };
      video.onerror = () => { clearTimeout(t); reject(new Error("video load error")); };
      video.load();
    });

    const duration = Math.min(isFinite(video.duration) ? video.duration : 30, maxSec);

    // Pre-load worker photo
    let photoImg: HTMLImageElement | null = null;
    if (input.photoUrl) {
      try { photoImg = await loadImage(input.photoUrl); } catch { /* skip */ }
    }

    // Set up MediaRecorder on a canvas capture stream
    const stream = (canvas as unknown as { captureStream(fps: number): MediaStream }).captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    recorder.start(250); // collect chunks every 250ms

    // Seek to start and play
    video.currentTime = 0;
    await video.play();

    // Composite loop: draw each frame until video ends or maxSec reached
    await new Promise<void>((resolve) => {
      let raf: number;
      const loop = () => {
        if (video.ended || video.paused || video.currentTime >= duration) {
          resolve();
          return;
        }
        try {
          drawCoverFromEl(ctx, video, 0, 0, W, H);
          drawOverlay(ctx, input, photoImg);
        } catch { /* tainted canvas or other draw error */ }
        input.onProgress?.(Math.min(video.currentTime / duration, 0.99));
        raf = requestAnimationFrame(loop);
      };
      video.onended = () => { cancelAnimationFrame(raf); resolve(); };
      raf = requestAnimationFrame(loop);
    });

    video.pause();
    recorder.stop();

    // Wait for all data to flush
    await new Promise<void>((r) => { recorder.onstop = () => r(); });
    stream.getTracks().forEach((t) => t.stop());

    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size < 1024) return null; // suspiciously small = failed capture

    input.onProgress?.(1);
    return await blobToDataUrl(blob);
  } catch {
    return null;
  } finally {
    document.body.removeChild(video);
  }
}
