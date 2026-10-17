// The deal page's loading shapes — a grid of figures, a list of cards, a
// table, the verdict's hero — in the shimmer every skeleton on the site
// draws (globals.css `.skeleton`). Pure, with no imports, so the homepage's
// walkthrough and /demo draw the same shape while a tab's chunk loads.

export function StatGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-4">
          <div className="skeleton h-2.5 w-16 rounded" />
          <div className="skeleton mt-3 h-5 w-20 rounded" />
        </div>
      ))}
    </div>
  );
}

export function CardListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-4">
          <div className="skeleton h-3 w-40 rounded" />
          <div className="skeleton mt-3 h-2.5 w-full rounded" />
          <div className="skeleton mt-2 h-2.5 w-4/5 rounded" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 py-2.5">
          <div className="skeleton h-3 w-1/4 rounded" />
          <div className="skeleton h-3 w-1/5 rounded" />
          <div className="skeleton h-3 w-1/5 rounded" />
          <div className="skeleton h-3 flex-1 rounded" />
        </div>
      ))}
    </div>
  );
}

export function VerdictSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="p-6">
          <div className="skeleton h-2.5 w-16 rounded" />
          <div className="mt-4 flex items-center gap-3">
            <div className="skeleton h-11 w-11 rounded-full" />
            <div className="skeleton h-7 w-40 rounded" />
          </div>
          <div className="skeleton mt-5 h-2.5 w-full rounded" />
          <div className="skeleton mt-2 h-2.5 w-3/4 rounded" />
        </div>
        <div className="grid gap-px bg-line sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="bg-surface p-5">
              <div className="skeleton h-2.5 w-20 rounded" />
              <div className="skeleton mt-3 h-2.5 w-full rounded" />
              <div className="skeleton mt-2 h-2.5 w-5/6 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
