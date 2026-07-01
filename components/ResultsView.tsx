import type { AuditResult } from '@/lib/types';
import ScoreCard from './ScoreCard';
import AuditSection from './AuditSection';

interface ResultsViewProps {
  result: AuditResult;
}

const GROUP_LABELS: Record<string, string> = {
  meta: 'Meta Tags',
  headings: 'Headings',
  images: 'Images',
  links: 'Links',
};

export default function ResultsView({ result }: ResultsViewProps) {
  const groups = new Map<string, typeof result.checks>();

  for (const check of result.checks) {
    const existing = groups.get(check.group) ?? [];
    existing.push(check);
    groups.set(check.group, existing);
  }

  return (
    <div className="flex flex-col gap-6">
      <ScoreCard score={result.score} url={result.url} />

      {Array.from(groups.entries()).map(([group, checks]) => (
        <div key={group} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            {GROUP_LABELS[group] ?? group}
          </h2>
          <div className="flex flex-col">
            {checks.map((check, index) => (
              <AuditSection
                key={`${check.label}-${index}`}
                label={check.label}
                status={check.status}
                message={check.message}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
