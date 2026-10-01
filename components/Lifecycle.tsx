export type LifecycleState = "done" | "current" | "wait";

export function Lifecycle({
  stages,
}: {
  stages: { label: string; state: LifecycleState; detail: string }[];
}) {
  return (
    <ol className="lifecycle">
      {stages.map((stage) => (
        <li key={stage.label} className={stage.state}>
          <strong>{stage.label}</strong>
          <span>{stage.detail}</span>
        </li>
      ))}
    </ol>
  );
}
