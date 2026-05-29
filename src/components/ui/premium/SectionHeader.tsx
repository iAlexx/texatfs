"use client";

export function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-4">
      <h1 className="text-xl font-bold tracking-tight text-white">{title}</h1>
      {subtitle ? (
        <p className="mt-1 text-sm text-steel-400">{subtitle}</p>
      ) : null}
    </header>
  );
}
