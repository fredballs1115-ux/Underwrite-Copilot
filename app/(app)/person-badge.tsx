import { PERSON_TONES, displayName, personInitials, personToneIndex } from "@/lib/person";

/** The badge's three sizes: 16px beside a line of small print (a card's
 *  footer, a task's meta line), 24px at the head of a row (a note, a
 *  question), 36px where the person is the row (the roster, the account,
 *  a broker's card). */
const SIZE = {
  xs: "h-4 w-4 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-9 w-9 text-xs",
} as const;

export type PersonBadgeSize = keyof typeof SIZE;

/**
 * A person, drawn: their initials in a circle of the tone they always wear
 * (signed-in gaps, H3). One badge for every place a person shows — the
 * sidebar and the phone's top bar, the team roster, a pipeline card's
 * teammate, a broker on the offering card, a task's assignee, a note's
 * author and a question's asker — where four copies had drawn four
 * different pictures of one person, and an email's domain had been read
 * as their initial.
 *
 * Pure (no hooks), so a server page and a client panel draw the same one.
 * The initials and the name come from lib/person: an email is read by its
 * local part, never its domain. The tone is hashed from `id` — the user's
 * id where the page has one, so the same person is the same colour on
 * every surface that knows them — else from the name.
 *
 * Its name is its title, and what a screen reader hears where the name is
 * not written beside it; where it is (`decorative`), the badge is hidden
 * from the reader so the name is not said twice.
 */
export function PersonBadge({
  name,
  id,
  size = "sm",
  decorative = false,
  className = "",
}: {
  /** the person's name, or their email where no name is set */
  name: string | null | undefined;
  /** what the tone is keyed on: their user id, where the page has it */
  id?: string | null;
  size?: PersonBadgeSize;
  /** the name is written beside the badge, so the badge says nothing */
  decorative?: boolean;
  className?: string;
}) {
  const label = displayName(name) || "Unnamed";
  const tone = PERSON_TONES[personToneIndex(id || label)];
  return (
    <span
      data-person-badge={size}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
      title={label}
      style={{ backgroundColor: tone }}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold leading-none tracking-tight text-white ${SIZE[size]} ${className}`}
    >
      {personInitials(name)}
    </span>
  );
}
