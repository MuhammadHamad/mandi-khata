/** Shown by a real build that has no database keys: what to do about it. */
export default function Setup() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="card w-full max-w-lg space-y-4 p-6">
        <h1 className="font-display text-2xl font-bold">Connect the database</h1>
        <p className="text-sm text-ink-soft">
          This copy of the app is not connected to a Supabase project yet, so it has nowhere to keep records.
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>Create a Supabase project and run <code>supabase/setup.sql</code> in its SQL editor.</li>
          <li>
            Copy <code>.env.example</code> to <code>.env</code> and fill in the project URL and anon key.
          </li>
          <li>Start the app again.</li>
        </ol>
        <p className="text-sm text-ink-soft">
          To look around first, run <code>npm run dev:demo</code>. It keeps sample records in the browser.
        </p>
      </div>
    </div>
  )
}
