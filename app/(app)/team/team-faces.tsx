// The team's members as faces: a row of overlapping PersonBadges beside the
// team header's "N seats · N shared deals", the way a shared folder shows who
// is in it. Six at most, then "+N" for the rest — the roster below names
// everyone. Pure, so the page and its render test draw one thing.
import { PersonBadge } from "../person-badge";
// lib/teams' `memberLabel` is this same reader; lib/teams is server-only.
import { personName } from "@/lib/person";

/** The most faces the row draws before it counts the rest. */
export const TEAM_FACES_MAX = 6;

export function TeamFaces({
  members,
}: {
  members: readonly { userId: string; fullName: string | null; email: string | null }[];
}) {
  if (members.length === 0) return null;
  const shown = members.slice(0, TEAM_FACES_MAX);
  const more = members.length - shown.length;
  return (
    <div data-qa="team-faces" role="group" aria-label="Team members" className="mt-2 flex items-center -space-x-2">
      {shown.map((m) => (
        <PersonBadge key={m.userId} name={personName(m.fullName, m.email)} id={m.userId} size="sm" className="ring-2 ring-surface" />
      ))}
      {more > 0 ? (
        <span
          data-qa="team-faces-more"
          role="img"
          aria-label={`and ${more} more`}
          title={`and ${more} more`}
          className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-faint px-1.5 text-[10px] font-semibold leading-none text-muted ring-2 ring-surface"
        >
          +{more}
        </span>
      ) : null}
    </div>
  );
}
