// components/CanLoader.tsx
// Minimal fizzing-bubbles loader

export function CanLoader({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 select-none">
      <div className="bubble-loader">
        <span className="b b1" />
        <span className="b b2" />
        <span className="b b3" />
        <span className="b b4" />
        <span className="b b5" />
        <span className="b b6" />
      </div>

      <p className="text-xs font-medium tracking-wide" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>

      <style>{`
        .bubble-loader {
          position: relative;
          width: 36px;
          height: 48px;
        }

        .b {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle at 38% 32%, rgba(103,232,249,0.9), rgba(6,182,212,0.35));
          border: 1px solid rgba(103,232,249,0.4);
          animation: bRise linear infinite;
          bottom: 0;
        }

        .b1 { width:7px; height:7px; left:2px;  animation-duration:1.6s; animation-delay:0s;    }
        .b2 { width:5px; height:5px; left:16px; animation-duration:1.2s; animation-delay:0.25s; }
        .b3 { width:9px; height:9px; left:24px; animation-duration:1.8s; animation-delay:0.5s;  }
        .b4 { width:4px; height:4px; left:9px;  animation-duration:1.1s; animation-delay:0.75s; }
        .b5 { width:6px; height:6px; left:29px; animation-duration:1.4s; animation-delay:1.0s;  }
        .b6 { width:5px; height:5px; left:18px; animation-duration:1.3s; animation-delay:1.3s;  }

        @keyframes bRise {
          0%   { transform: translateY(0)     scale(1);    opacity: 0;   }
          8%   {                                            opacity: 0.85; }
          75%  {                                            opacity: 0.3; }
          100% { transform: translateY(-44px) scale(0.4);  opacity: 0;   }
        }
      `}</style>
    </div>
  );
}
