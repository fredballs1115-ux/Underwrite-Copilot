// Deal-shaped skeleton so opening a deal feels instant — mirrors the real
// layout (back link, header card with stats, tab strip, panel) instead of the
// generic list skeleton.
export default function DealLoading() {
  return (
    <div role="status" aria-label="Loading deal" className="flex flex-col gap-6">
      <div className="skeleton h-4 w-20 rounded" />
      <div className="shadow-card rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2.5">
            <div className="skeleton h-7 w-64 rounded-lg" />
            <div className="skeleton h-3.5 w-44 rounded" />
          </div>
          <div className="skeleton h-8 w-28 rounded-lg" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-14 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-9 w-24 rounded-lg" />
        ))}
      </div>
      <div className="skeleton h-72 w-full rounded-2xl" />
    </div>
  );
}
