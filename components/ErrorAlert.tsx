interface ErrorAlertProps {
  status: number;
  message: string;
  onRetry?: () => void;
}

interface AlertContent {
  tone: 'warn' | 'fail';
  title: string;
  showRetry: boolean;
}

function getAlertContent(status: number): AlertContent {
  if (status === 429) return { tone: 'warn', title: "You've reached the rate limit", showRetry: false };
  if (status === 502 || status === 504) return { tone: 'fail', title: "We couldn't reach that site", showRetry: true };
  if (status === 500) return { tone: 'fail', title: 'Something went wrong on our end', showRetry: true };
  if (status === 400) return { tone: 'fail', title: "That URL couldn't be audited", showRetry: false };
  return { tone: 'fail', title: "Couldn't reach the audit service", showRetry: true };
}

const TONE_STYLES: Record<'warn' | 'fail', { alert: string; badge: string; title: string; retry: string }> = {
  warn: {
    alert: 'bg-warn-bg border-warn-border',
    badge: 'bg-warn-text',
    title: 'text-warn-text',
    retry: 'border-warn-border text-warn-text',
  },
  fail: {
    alert: 'bg-fail-bg border-fail-border',
    badge: 'bg-fail-text',
    title: 'text-fail-text',
    retry: 'border-fail-border text-fail-text',
  },
};

export default function ErrorAlert({ status, message, onRetry }: ErrorAlertProps) {
  const content = getAlertContent(status);
  const styles = TONE_STYLES[content.tone];

  return (
    <div className={`flex items-start gap-3.5 rounded-xl border px-[18px] py-4 ${styles.alert}`}>
      <span
        className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full font-sans text-[13px] font-extrabold text-white ${styles.badge}`}
      >
        !
      </span>
      <div className="flex-1">
        <div className={`mb-1 font-sans text-sm font-bold ${styles.title}`}>{content.title}</div>
        <div className="font-sans text-sm leading-relaxed text-ink-2">{message}</div>
        {content.showRetry && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className={`mt-3 rounded-lg border bg-transparent px-4 py-2 font-sans text-[13px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${styles.retry}`}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
