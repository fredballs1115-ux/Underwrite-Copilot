// GET /api/og/plain — the site's plain card (lib/plain-card): the mark and
// the name, nothing else, as the link preview of a page that is private —
// a shared deal screen (app/share/[token]) — where the homepage's advert
// would be the wrong picture and the deal's own must never be drawn.
//
// PUBLIC, as a preview must be: a crawler asks for it without a session.
// It reads nothing and takes no input.

import { plainCard } from "@/lib/plain-card";

export function GET() {
  return plainCard();
}
