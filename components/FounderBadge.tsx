// components/FounderBadge.tsx

export const FOUNDERS = new Set(['eduvillasr']);

export function FounderBadge() {
  return (
    <span
      title="Founder"
      className="inline-flex items-center justify-center flex-shrink-0"
      style={{
        width: '15px',
        height: '15px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
        boxShadow: '0 0 5px rgba(245,158,11,0.45)',
        verticalAlign: 'middle',
      }}
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
