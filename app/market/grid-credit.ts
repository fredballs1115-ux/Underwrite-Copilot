import { metroView } from "@/lib/metro-imagery";
import { skylineCredit, skylineFor } from "@/lib/skyline";
import type { GridPicture } from "@/lib/shown-credit";

/**
 * A grid's markets as the data its one credit line is built from
 * (app/shown-credit `ShownCreditGrid`): each market's photograph credit, and
 * whether it has an overhead to fall back to. Read on the server, so the
 * client line never loads the photograph table.
 */
export function gridPictures(ids: readonly string[]): GridPicture[] {
  return ids.map((id) => {
    const shot = skylineFor(id);
    return { id, skyline: shot ? skylineCredit(shot) : null, overhead: metroView(id) != null };
  });
}
