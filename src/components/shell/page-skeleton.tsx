/** Placeholder enquanto o conteúdo (dependente do relógio local) monta no cliente. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="animate-pulse">
      <div className="h-3 w-40 rounded-tile bg-mist" />
      <div className="mt-5 h-10 w-56 rounded-tile bg-mist" />
      <div className="mt-3 h-10 w-40 rounded-tile bg-mist" />
      <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-12">
        <div className="flex flex-col gap-3 lg:col-span-7">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-tile bg-mist-soft" />
          ))}
        </div>
        <div className="flex flex-col gap-3 lg:col-span-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-tile bg-mist-soft" />
          ))}
        </div>
      </div>
    </div>
  );
}
