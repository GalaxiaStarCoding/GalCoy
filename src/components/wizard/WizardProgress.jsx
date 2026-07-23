const STEPS = ['Bot Name', 'Server Details', 'Channel'];

export default function WizardProgress({ currentStep }) {
  return (
    <nav aria-label="Setup progress">
      <ol className="flex items-center gap-2 text-sm">
        {STEPS.map((label, i) => {
          const stepNum = i + 1;
          const isCurrent = stepNum === currentStep;
          const isComplete = stepNum < currentStep;
          return (
            <li
              key={label}
              className="flex items-center gap-2"
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                  isCurrent
                    ? 'bg-primary text-primary-foreground'
                    : isComplete
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
                aria-hidden="true"
              >
                {stepNum}
              </span>
              <span className={isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <span className="text-muted-foreground mx-1" aria-hidden="true">—</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}