export interface Description {
  // One line: the show or film, and the episode when the release names one.
  heading: string;
  text: string;
  // Which service answered, so the UI can credit it.
  via: "TVmaze" | "Wikipedia";
}

export interface DescribeOptions {
  signal?: AbortSignal;
}
