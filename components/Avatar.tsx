// components/Avatar.tsx

interface AvatarProps {
  username?: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

export function Avatar({ username, avatarUrl, size = 36, className = '' }: AvatarProps) {
  const initial = username?.charAt(0)?.toUpperCase() || '?';

  return (
    <div
      className={`rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        background: avatarUrl ? 'transparent' : 'linear-gradient(135deg, #22d3ee, #a78bfa)',
        boxShadow: '0 0 12px rgba(6, 182, 212, 0.15)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={username || 'Avatar'}
          className="w-full h-full object-cover"
          style={{ aspectRatio: '1 / 1' }}
        />
      ) : (
        <span
          className="text-white font-bold uppercase select-none"
          style={{ fontSize: `${size * 0.4}px` }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}
