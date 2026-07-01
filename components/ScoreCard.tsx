interface ScoreCardProps {
  score: number;
  url: string;
}

function getScoreColorClasses(score: number): { bg: string; text: string; ring: string } {
  if (score < 50) {
    return { bg: 'bg-red-50', text: 'text-red-600', ring: 'ring-red-200' };
  }
  if (score < 80) {
    return { bg: 'bg-yellow-50', text: 'text-yellow-600', ring: 'ring-yellow-200' };
  }
  return { bg: 'bg-green-50', text: 'text-green-600', ring: 'ring-green-200' };
}

export default function ScoreCard({ score, url }: ScoreCardProps) {
  const colors = getScoreColorClasses(score);

  return (
    <div className={`flex flex-col items-center gap-2 rounded-xl p-8 ring-1 ${colors.bg} ${colors.ring}`}>
      <span className="text-sm font-medium text-gray-500 break-all text-center">{url}</span>
      <span className={`text-6xl font-bold ${colors.text}`}>{score}</span>
      <span className="text-sm text-gray-500">out of 100</span>
    </div>
  );
}
