// Shown during navigation between signed-in screens, before the server
// component's data resolves — keeps transitions smooth instead of blank.
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2.5">
        <div className="skeleton h-7 w-44 rounded-lg" />
        <div className="skeleton h-3.5 w-56 rounded" />
      </div>
      <div className="skeleton h-28 w-full rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
