/**
 * The data-health page's open issues (research pass 42, L3): it lists the
 * newest ISSUES_LISTED and had headed them with the count of those listed,
 * so a steward run that opened seventy read as fifty, and a failed read as
 * "Nothing open". The heading carries the exact count of every open issue,
 * and the list says where it is a cut.
 *
 * No imports.
 */

/** Open issues the page lists, newest first. */
export const ISSUES_LISTED = 50;

/** The count beside the heading: every open issue where the count was read,
 *  else the ones listed. */
export function openIssuesCount(listed: number, total: number | null): number {
  return total != null && total > listed ? total : listed;
}

/** The line under a list that is a cut, or null. */
export function openIssuesCutLine(listed: number, total: number | null): string | null {
  if (total == null || total <= listed) return null;
  return `The newest ${listed} of ${total.toLocaleString("en-US")} open issues are listed.`;
}
