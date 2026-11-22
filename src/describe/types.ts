export interface Description {
  // One line: the show or film, and the episode when the release names one.
  heading: string;
  text: string;
  // Which service answered, so the UI can credit it.
  via: "TVmaze" | "Wikipedia";
  // The service's own poster for the title, when it has one. Only ever a URL
  // fetchPosterFrom will accept.
  poster?: string;
}

export interface DescribeOptions {
  signal?: AbortSignal;
}
