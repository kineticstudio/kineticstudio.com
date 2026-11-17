/* A site or film laid onto the MacBook render's glass (src/data/macbook-angle.json: its screen's corners as
   fractions of the frame, from devices.py). An orthographic camera makes the screen an exact parallelogram,
   so one affine matrix maps a sw x sh box onto it; the render's screen is the glass itself (bezel already
   drawn round it, checked Nov 17 with a test grid), so by default it fills it edge to edge. */
import MAC from "@/data/macbook-angle.json";

export type Glass = { insetX?: number; insetTop?: number; insetBottom?: number; radius?: number };

export function fitScreen(dev: HTMLElement, screen: HTMLElement, g: Glass = {}) {
  const W = dev.clientWidth, H = dev.clientHeight, [sw, sh] = MAC.screen;
  const q = MAC.q.map(([x, y]) => [x * W, y * H]);
  const ux = [(q[1][0] - q[0][0]) / sw, (q[1][1] - q[0][1]) / sw], vy = [(q[3][0] - q[0][0]) / sh, (q[3][1] - q[0][1]) / sh];
  const ix = (g.insetX ?? 0) * sw, it = (g.insetTop ?? 0) * sh, ib = (g.insetBottom ?? 0) * sh, r = (g.radius ?? 0.004) * sw;
  screen.style.width = `${sw - 2 * ix}px`;
  screen.style.height = `${sh - it - ib}px`;
  screen.style.borderRadius = `${r}px ${r}px ${r / 3}px ${r / 3}px`;
  screen.style.transform = `matrix(${ux[0]},${ux[1]},${vy[0]},${vy[1]},${q[0][0] + ux[0] * ix + vy[0] * it},${q[0][1] + ux[1] * ix + vy[1] * it})`;
}

/* The screen's middle, as fractions of the frame. */
export const screenCentre = () => [MAC.q.reduce((a, p) => a + p[0], 0) / 4, MAC.q.reduce((a, p) => a + p[1], 0) / 4];
