const PATHS = {
  "Inbox": "<path d=\"M4 4h16v16H4zM4 13h4l2 3h4l2-3h4\"/>",
  "Today": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5\"/>",
  "Upcoming": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"3\"/><path d=\"M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2\"/>",
  "Anytime": "<path d=\"m12 3 10 6-10 6L2 9zM3 14l9 5 9-5M3 18l9 5 9-5\"/>",
  "Someday": "<rect x=\"3\" y=\"7\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M2 3h20v4H2zm7 9h6\"/>",
  "Logbook": "<path d=\"M6 3h14v18H6a3 3 0 0 1 0-6h14M6 3a3 3 0 0 0-3 3v12m7-10 2 2 4-4\"/>",
  "project": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 3v9l6 5\"/>",
  "moon": "<path d=\"M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5z\"/>",
  "search": "<circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"m16 16 5 5\"/>",
  "more": "<circle cx=\"5\" cy=\"12\" r=\"1\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"19\" cy=\"12\" r=\"1\"/>"
};

export function icon(name) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">
    ${PATHS[name] ?? PATHS.project}
  </svg>`;
}
