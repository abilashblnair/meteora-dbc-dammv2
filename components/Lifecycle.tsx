export type LifecycleState = "done" | "current" | "wait";

export function Lifecycle({
  stages,
}: {
  stages: { label: string; state: LifecycleState; detail: string }[];
}) {
  return (
    <ol className="lifecycle" aria-label="Launch lifecycle">
      {stages.map((stage, index) => (
        <li key={stage.label} className={stage.state} aria-current={stage.state === "current" ? "step" : undefined}>
          <span className="lifecycle-mark" aria-hidden="true">
            {stage.state === "done" ? (
              <svg viewBox="0 0 16 16" width="12" height="12">
                <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              index + 1
            )}
          </span>
          <span className="lifecycle-text">
            <strong>{stage.label}</strong>
            <span>{stage.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
