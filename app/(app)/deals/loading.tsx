// The pipeline's own shape while its data loads, so arriving at it feels
// instant: the heading, the ladder-and-split strip, the filters, a stage's
// header and a grid of cards led by their 16:10 pictures — the cards view a
// reader lands on (#428) — where the signed-in area's generic skeleton drew
// a list. The deal page and its tabs keep their own ([id]/loading.tsx), and
// the compare page the generic one (compare/loading.tsx).
export default function PipelineLoading() {
  return (
    <div role="status" aria-label="Loading your pipeline" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Pipeline</h1>
          <div className="skeleton mt-2 h-3.5 w-36 rounded" />
        </div>
        <div className="skeleton h-10 w-28 rounded-lg" />
      </div>
      <div className="skeleton h-20 w-full rounded-2xl" />
      <div className="flex flex-wrap items-center gap-2">
        {["w-48", "w-28", "w-28", "w-32"].map((w, i) => (
          <div key={i} className={`skeleton h-8 rounded-lg ${w}`} />
        ))}
      </div>
      <div>
        <div className="skeleton h-5 w-28 rounded" />
        <ul className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-loading="cards">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              <div className="skeleton aspect-[16/10] w-full" data-card-picture />
              <div className="px-4 pb-3.5 pt-3">
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="skeleton mt-2 h-3 w-1/2 rounded" />
                <div className="mt-4 grid grid-cols-[minmax(0,4fr)_minmax(0,3fr)_minmax(0,3fr)] gap-3 border-t border-line pt-3">
                  {["w-14", "w-10", "w-12"].map((w, k) => (
                    <div key={k}>
                      <div className="skeleton h-2.5 w-8 rounded" />
                      <div className={`skeleton mt-1.5 h-4 rounded ${w}`} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="h-9 border-t border-line bg-faint/60" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
