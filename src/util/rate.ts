// Parse a short human transfer rate like "500k", "2m", "1.5MB/s" into bytes per
// second (1k = 1024). A bare number is bytes per second. "0", "off" and
// "unlimited" mean no limit and come back as 0. Returns null for anything
// unparseable.
export function parseRate(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (s === "off" || s === "unlimited") return 0;
  const m = /^(\d+(?:\.\d+)?)\s*([kmg])?(?:i?b)?(?:\/s|ps)?$/.exec(s);
  if (!m) return null;
  const mult = { k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[m[2] ?? ""] ?? 1;
  return Math.floor(Number.parseFloat(m[1]!) * mult);
}
