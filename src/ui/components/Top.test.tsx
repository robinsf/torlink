import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreContext, type Store } from "../store";
import { makeTestStore, renderUI, type RenderedUI } from "../testHarness";
import { Top } from "./Top";
import type { Loaded } from "../hooks/useTop";
import type { Episode, TitleDetails, TopTitle } from "../../tmdb/top";

const hooks = vi.hoisted(() => ({
  top: null as unknown,
  details: null as unknown,
  episodes: null as unknown,
  poster: "none" as unknown,
  topCalls: [] as unknown[][],
  posterCalls: [] as unknown[],
}));

vi.mock("../hooks/useTop", () => ({
  useTopTitles: (...args: unknown[]) => {
    hooks.topCalls.push(args);
    return hooks.top;
  },
  useTitleDetails: () => hooks.details,
  useEpisodes: () => hooks.episodes,
  usePoster: (path: unknown) => {
    hooks.posterCalls.push(path);
    return hooks.poster;
  },
}));

const loaded = <T,>(value: T | null, error: string | null = null): Loaded<T> => ({
  loading: false,
  error,
  value,
});

const SHOWS: TopTitle[] = [
  { id: 1, kind: "tv", title: "Severance", year: "2022", rating: 8.4, overview: "Mark works at Lumon Industries.", poster: "/sev.jpg" },
  { id: 2, kind: "tv", title: "Slow Horses", year: "2022", rating: 8.1, overview: "Spies in exile." },
];
const DETAILS: TitleDetails = {
  genres: ["Drama", "Sci-Fi"],
  runtime: undefined,
  status: "Returning Series",
  seasons: [
    { number: 1, name: "Season 1", episodes: 9 },
    { number: 2, name: "Season 2", episodes: 10 },
  ],
};
const EPISODES: Episode[] = [
  { number: 1, name: "Hello, Ms. Cobel", overview: "", airDate: "2025-01-17" },
  { number: 2, name: "Goodbye, Mrs. Selvig", overview: "", airDate: "2025-01-24" },
];

let ui: RenderedUI | null = null;
afterEach(() => {
  ui?.unmount();
  ui = null;
  hooks.poster = "none";
  hooks.posterCalls.length = 0;
});

function mount(store: Partial<Store> = {}): RenderedUI {
  hooks.topCalls.length = 0;
  ui = renderUI(
    <StoreContext.Provider value={makeTestStore({ section: "top", ...store })}>
      <Top />
    </StoreContext.Provider>,
  );
  return ui;
}

describe("Top picks", () => {
  it("lists the platform's top titles with year and rating", async () => {
    hooks.top = loaded(SHOWS);
    const u = mount();
    await vi.waitFor(() => expect(u.frame()).toContain("Severance (2022)"));
    expect(u.frame()).toContain("Slow Horses (2022)");
    expect(u.frame()).toContain("★ 8.4");
    expect(u.frame()).toContain("Top picks · Netflix");
    expect(hooks.topCalls.at(-1)).toEqual(["netflix", "tv", undefined]);
  });

  it("steps through platforms with ] and [, and between shows and movies with v", async () => {
    hooks.top = loaded(SHOWS);
    const u = mount();
    await vi.waitFor(() => expect(u.frame()).toContain("Top picks · Netflix"));
    // One key per tick: bytes written together reach Ink as a single input.
    u.press("]");
    await vi.waitFor(() => expect(u.frame()).toContain("Top picks · Prime Video"));
    u.press("[");
    await vi.waitFor(() => expect(u.frame()).toContain("Top picks · Netflix"));
    u.press("[");
    await vi.waitFor(() => expect(u.frame()).toContain("Top picks · Paramount+"));
    u.press("v");
    await vi.waitFor(() => expect(hooks.topCalls.at(-1)).toEqual(["paramount", "movie", undefined]));
  });

  it("explains how to get a TMDB key when none is set", async () => {
    hooks.top = loaded(null, "nokey");
    const u = mount();
    await vi.waitFor(() => expect(u.frame()).toContain("needs a free TMDB key"));
    expect(u.frame()).toContain("TORLINK_TMDB_KEY");
  });

  it("shows another failure as a line, not a crash", async () => {
    hooks.top = loaded(null, "Couldn't reach TMDB.");
    const u = mount();
    await vi.waitFor(() => expect(u.frame()).toContain("Couldn't reach TMDB."));
  });

  it("opens details with the overview, genres and the newest season's episodes", async () => {
    hooks.top = loaded(SHOWS);
    hooks.details = loaded(DETAILS);
    hooks.episodes = loaded(EPISODES);
    const u = mount();
    await vi.waitFor(() => expect(u.frame()).toContain("Severance (2022)"));
    u.press("\r");
    await vi.waitFor(() => expect(u.frame()).toContain("Mark works at Lumon Industries."));
    expect(u.frame()).toContain("Drama, Sci-Fi");
    expect(u.frame()).toContain("2 seasons");
    expect(u.frame()).toContain("Season 2");
    expect(u.frame()).toContain("Hello, Ms. Cobel");
    expect(u.frame()).toContain("2025-01-17");
  });

  it("jumps to the platform's tab with the title searched", async () => {
    hooks.top = loaded(SHOWS);
    const setSection = vi.fn();
    const submitQuery = vi.fn();
    const u = mount({ setSection, submitQuery });
    await vi.waitFor(() => expect(u.frame()).toContain("Severance (2022)"));
    u.press("j");
    await vi.waitFor(() => expect(u.frame()).toMatch(/❯\s+2\s+Slow Horses/));
    u.press("s");
    await vi.waitFor(() => expect(submitQuery).toHaveBeenCalledWith("Slow Horses"));
    expect(setSection).toHaveBeenCalledWith("platform-netflix");
  });

  it("draws the poster beside the details as coloured half blocks", async () => {
    hooks.top = loaded(SHOWS);
    hooks.details = loaded(DETAILS);
    hooks.episodes = loaded(EPISODES);
    hooks.poster = { width: 4, height: 6, data: new Uint8Array(4 * 6 * 4).fill(200) };
    const u = mount();
    await vi.waitFor(() => expect(u.frame()).toContain("Severance (2022)"));
    u.press("\r");
    await vi.waitFor(() => expect(u.frame()).toContain("▀▀▀▀"));
    expect(hooks.posterCalls.at(-1)).toBe("/sev.jpg");
    // The text is still there, next to it.
    expect(u.frame()).toContain("Mark works at Lumon");
  });

  it("makes room for the text again when there is no poster to show", async () => {
    hooks.top = loaded(SHOWS);
    hooks.details = loaded(DETAILS);
    hooks.episodes = loaded(EPISODES);
    hooks.poster = "none";
    const u = mount();
    await vi.waitFor(() => expect(u.frame()).toContain("Severance (2022)"));
    u.press("\r");
    await vi.waitFor(() => expect(u.frame()).toContain("Mark works at Lumon"));
    expect(u.frame()).not.toContain("▀");
  });

  it("steps through the last five years with y, then back to popular now", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-22T12:00:00Z"));
    try {
      hooks.top = loaded(SHOWS);
      const u = mount();
      await vi.waitFor(() => expect(u.frame()).toContain("popular now"));
      for (const year of [2026, 2025, 2024, 2023, 2022]) {
        u.press("y");
        await vi.waitFor(() => expect(hooks.topCalls.at(-1)).toEqual(["netflix", "tv", year]));
        expect(u.frame()).toContain(`Top picks · Netflix · ${year}`);
        expect(u.frame()).toContain(`from ${year}`);
      }
      u.press("y");
      await vi.waitFor(() => expect(hooks.topCalls.at(-1)).toEqual(["netflix", "tv", undefined]));
      expect(u.frame()).toContain("popular now");
    } finally {
      vi.useRealTimers();
    }
  });
});
