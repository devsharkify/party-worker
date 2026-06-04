// Web: composite the HQ asset + the worker's photo/name/booth + a burned AI label
// onto an off-screen canvas and return a PNG data URL for upload. Returns null if
// an image can't be loaded with CORS (canvas would be tainted) so the caller can
// gracefully fall back to a preview-only render.
import type { CompositeInput } from "./composite";

export type { CompositeInput };

const W = 1080;
const H = 1920;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${url}`));
    img.src = url;
  });
}

/** Draw an image cover-fit into the destination rect (center-crop). */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const ir = img.width / img.height;
  const dr = dw / dh;
  let sw: number, sh: number, sx: number, sy: number;
  if (ir > dr) {
    sh = img.height;
    sw = sh * dr;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / dr;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

export async function captureComposite(input: CompositeInput): Promise<string | null> {
  try {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Background (HQ creative). If it fails CORS, fall back to a solid color.
    try {
      const bg = await loadImage(input.sourceUrl);
      drawCover(ctx, bg, 0, 0, W, H);
    } catch {
      ctx.fillStyle = "#0b1f3a";
      ctx.fillRect(0, 0, W, H);
    }

    // Bottom scrim for legibility.
    const grad = ctx.createLinearGradient(0, H * 0.5, 0, H);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.68)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, H * 0.5, W, H * 0.5);

    // Identity block (photo + name/designation/booth) near the bottom.
    const photo = 190;
    const px = 64;
    const py = Math.round(H * 0.72);
    if (input.photoUrl) {
      try {
        const ph = await loadImage(input.photoUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(px + photo / 2, py + photo / 2, photo / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        drawCover(ctx, ph, px, py, photo, photo);
        ctx.restore();
        ctx.lineWidth = 8;
        ctx.strokeStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(px + photo / 2, py + photo / 2, photo / 2, 0, Math.PI * 2);
        ctx.stroke();
      } catch {
        /* skip photo on CORS failure */
      }
    }

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

    // Non-removable AI-content label band (>=~7% area, per IT Rules 2025).
    const bandH = Math.round(H * 0.07);
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(0, H - bandH, W, bandH);
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 32px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(input.aiLabel, W / 2, H - bandH / 2 + 11);
    ctx.textAlign = "left";

    // Throws if the canvas is tainted (cross-origin image without CORS) -> caught below.
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
