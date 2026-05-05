// components/Skeletons.tsx
// Shimmer placeholders for loading states.

export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl p-4 skeleton-shell"
          style={{ background: 'rgba(15,20,36,0.4)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full skeleton-block" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 rounded-full skeleton-block" style={{ width: '40%' }} />
              <div className="h-2.5 rounded-full skeleton-block" style={{ width: '25%' }} />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-4 rounded skeleton-block" style={{ width: '70%' }} />
              <div className="h-2.5 rounded skeleton-block" style={{ width: '35%' }} />
              <div className="h-2.5 rounded skeleton-block" style={{ width: '90%' }} />
              <div className="h-2.5 rounded skeleton-block" style={{ width: '85%' }} />
            </div>
            <div className="w-20 h-24 rounded-lg skeleton-block flex-shrink-0" />
          </div>
        </div>
      ))}

      <style>{`
        .skeleton-block {
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0.04) 0%,
            rgba(255,255,255,0.10) 50%,
            rgba(255,255,255,0.04) 100%
          );
          background-size: 200% 100%;
          animation: shimmerSlide 1.6s ease-in-out infinite;
        }
        @keyframes shimmerSlide {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .skeleton-shell {
          opacity: 0.85;
        }
      `}</style>
    </div>
  );
}
