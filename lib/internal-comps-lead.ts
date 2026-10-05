/**
 * What the deal page's "From your pipeline" block shows, said as the read
 * finds it (research pass 42, M1): the reader's most recent screens of the
 * deal's class, counted, and whose they are — the read is the reader's and
 * their team's (row-level security hands over both), so a teammate's screen
 * among them is said, never "each OM you've screened". No imports: the
 * deal view, a client component, reads it.
 */
export function internalCompsLead(count: number, withTeam: boolean): string {
  const what = count === 1 ? "Your most recent screen" : `Your ${count} most recent screens`;
  const whose = withTeam ? ", yours and your team's," : "";
  return `${what} of the same asset class${whose} as extracted from each OM — your own frame of reference, not third-party comp data.`;
}
