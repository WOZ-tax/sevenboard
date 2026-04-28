"use client";

export function Placeholder({
  description,
  todos,
}: {
  description: string;
  todos: string[];
}) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">{description}</p>
      <div className="rounded border border-dashed border-muted-foreground/30 bg-muted/20 p-3">
        <div className="mb-1.5 text-xs font-semibold text-muted-foreground">
          実装予定（TODO）
        </div>
        <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
          {todos.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
