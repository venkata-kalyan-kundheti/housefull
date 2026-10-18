export default function HomePage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Shows in the next 7 days
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Detect underfilled showtimes and discover targeted taste audiences.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-8 text-center text-zinc-500">
        <p className="text-sm">Schedule Board initializing...</p>
        <p className="text-xs text-zinc-400 mt-2">
          Milestone M0 Scaffold complete. Ready for database and showtime seeding in Milestone M2.
        </p>
      </div>
    </div>
  );
}
