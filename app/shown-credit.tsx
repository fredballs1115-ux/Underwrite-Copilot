"use client";

import { createContext, useCallback, useMemo, useState, type ReactNode } from "react";
import { shownCredit, type GridPicture, type ShownMode } from "@/lib/shown-credit";
import { GalleryCreditPartsText } from "./credit-parts";

/** Where a market tile (`CityPhotoView` with `reportAs`) says what it settled
 *  on, keyed by the tile's own id. Absent, a tile reports to nobody. */
export const ShownPicturesContext = createContext<{
  report: (key: string, metro: string, mode: ShownMode) => void;
  forget: (key: string) => void;
} | null>(null);

/**
 * A grid of market tiles and its one credit line under them, the line built
 * from what each tile actually shows (lib/shown-credit): a photograph that
 * fails and hands its tile to the overhead takes its photographer off the
 * line and puts the overhead's on. The server's render, before any picture
 * settles, credits each tile's first picture. `pictures` is the grid's
 * markets as data (app/market/grid-credit `gridPictures`), so this never
 * loads the photograph table.
 */
export function ShownCreditGrid({
  pictures,
  overheadLine,
  qa,
  className,
  linkClassName,
  children,
}: {
  pictures: readonly GridPicture[];
  /** lib/skyline's OVERHEAD_GRID_CREDIT, handed in as words */
  overheadLine: string;
  /** the line's data-qa */
  qa: string;
  className: string;
  linkClassName?: string;
  children: ReactNode;
}) {
  const [tiles, setTiles] = useState<ReadonlyMap<string, { metro: string; mode: ShownMode }>>(new Map());
  const report = useCallback((key: string, metro: string, mode: ShownMode) => {
    setTiles((m) => {
      const was = m.get(key);
      if (was && was.metro === metro && was.mode === mode) return m;
      return new Map(m).set(key, { metro, mode });
    });
  }, []);
  const forget = useCallback((key: string) => {
    setTiles((m) => {
      if (!m.has(key)) return m;
      const next = new Map(m);
      next.delete(key);
      return next;
    });
  }, []);
  const ctx = useMemo(() => ({ report, forget }), [report, forget]);

  const reports = new Map<string, ShownMode[]>();
  for (const { metro, mode } of tiles.values()) reports.set(metro, [...(reports.get(metro) ?? []), mode]);
  const { photos, overhead } = shownCredit(pictures, reports);

  return (
    <ShownPicturesContext.Provider value={ctx}>
      {children}
      {photos.length > 0 || overhead ? (
        <p className={className} data-qa={qa}>
          {photos.length > 0 ? (
            <>
              <GalleryCreditPartsText credits={photos} linkClassName={linkClassName} />{" "}
            </>
          ) : null}
          {overhead ? overheadLine : null}
        </p>
      ) : null}
    </ShownPicturesContext.Provider>
  );
}
