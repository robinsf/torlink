import { useEffect, useState } from "react";
import { deleteCommand, newImageId, posterMode, uploadCommands, MAX_PLACEHOLDER } from "../kitty";
import type { Pixels } from "../../tmdb/poster";

// Uploads a poster to the terminal as an inline image and returns its id once
// it is there, or null when this terminal is not drawing images, there is no
// image yet, or the poster is bigger than the placeholder table can number. The
// image is freed when the poster goes away or changes.
export function useKittyImage(img: Pixels | null, cols: number, rows: number): number | null {
  const [id, setId] = useState<number | null>(null);

  useEffect(() => {
    if (!img || posterMode() !== "kitty" || cols > MAX_PLACEHOLDER || rows > MAX_PLACEHOLDER) {
      setId(null);
      return;
    }
    const mine = newImageId();
    try {
      for (const chunk of uploadCommands(mine, img, cols, rows)) process.stdout.write(chunk);
    } catch {
      setId(null);
      return;
    }
    setId(mine);
    return () => {
      try {
        process.stdout.write(deleteCommand(mine));
      } catch {
        // the terminal is going away; nothing left to free
      }
      setId(null);
    };
  }, [img, cols, rows]);

  return id;
}
