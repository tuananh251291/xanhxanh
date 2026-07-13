const CONFETTI_COLORS = ["bg-primary", "bg-secondary", "bg-achievement", "bg-warning", "bg-info"];

export type ConfettiPiece = {
  id: number;
  left: number;
  color: string;
  delayMs: number;
  durationMs: number;
  spinDeg: number;
};

export function generateConfettiPieces(burst: number, count = 36): ConfettiPiece[] {
  if (burst === 0) return [];
  return Array.from({ length: count }).map((_, i) => ({
    id: burst * 1000 + i,
    left: Math.random() * 100,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delayMs: Math.random() * 250,
    durationMs: 1200 + Math.random() * 700,
    spinDeg: 360 + Math.random() * 540,
  }));
}
