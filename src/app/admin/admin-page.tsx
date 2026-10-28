import { Suspense, type ReactNode } from "react";

// An admin screen is one Ultima-style card on the light ground. The content
// reads the session and the database, so it renders inside a boundary.
export function AdminPage({
  title,
  note,
  wide = false,
  children,
}: {
  // Detail pages leave it out and title the card with the record's name.
  title?: ReactNode;
  note?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <main className={`mx-auto w-full ${wide ? "max-w-screen-2xl" : "max-w-6xl"}`}>
      <section className="rounded-xl bg-white p-5 sm:p-6">
        {title && <h1 className="text-xl font-semibold">{title}</h1>}
        {note && <p className="mt-1 text-sm text-ink-muted">{note}</p>}
        <div className={title || note ? "mt-5" : ""}>
          <Suspense fallback={<p className="text-ink-muted">載入中…</p>}>
            {children}
          </Suspense>
        </div>
      </section>
    </main>
  );
}
