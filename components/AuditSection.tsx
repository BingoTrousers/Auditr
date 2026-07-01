import type { CheckStatus } from '@/lib/types';

interface AuditSectionProps {
  label: string;
  status: CheckStatus;
  message: string;
}

const STATUS_STYLES: Record<CheckStatus, { badge: string; text: string; dot: string }> = {
  pass: { badge: 'bg-green-100 text-green-800', text: 'Pass', dot: 'bg-green-500' },
  warning: { badge: 'bg-yellow-100 text-yellow-800', text: 'Warning', dot: 'bg-yellow-500' },
  fail: { badge: 'bg-red-100 text-red-800', text: 'Fail', dot: 'bg-red-500' },
};

export default function AuditSection({ label, status, message }: AuditSectionProps) {
  const styles = STATUS_STYLES[status];

  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-3 last:border-b-0">
      <div>
        <p className="font-medium text-gray-900">{label}</p>
        <p className="mt-0.5 text-sm text-gray-600">{message}</p>
      </div>
      <span className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${styles.badge}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
        {styles.text}
      </span>
    </div>
  );
}
