import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Keep tests off the real user data dir: redirect all persisted state (queue /
// history / seeds / config) into a temp folder via the TORLINK_STATE_DIR
// override that src/config/paths.ts honors. Applied before test modules import
// paths.ts, so every write during a run lands here instead.
export default defineConfig({
  test: {
    env: {
      TORLINK_STATE_DIR: path.join(os.tmpdir(), "torlink-test-state"),
      // Tests run in whatever terminal started them; blocks keep a Ghostty or
      // Kitty session from having image escape sequences written into its
      // output. The tests for the image path turn the mode on themselves.
      TORLINK_POSTER_MODE: "blocks",
    },
  },
});
