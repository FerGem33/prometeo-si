import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { playMissionIgnition } from "../report/sound";

export interface LaunchButtonProps {
  onLaunch: () => void;
  label?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

const SPARKS = Array.from({ length: 24 }, (_, i) => i);
const CROWN_TONGUES = Array.from({ length: 16 }, (_, i) => i * (360 / 16));

export function LaunchButton({
  onLaunch,
  label = "Begin evaluation",
  className = "cta big",
  autoFocus,
  disabled,
}: LaunchButtonProps) {
  const [origin, setOrigin] = useState<{ x: number; y: number; r: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || origin) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) {
      onLaunch();
      return;
    }
    const b = e.currentTarget.getBoundingClientRect();
    const x = b.left + b.width / 2;
    const y = b.top + b.height / 2;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 80;
    setOrigin({ x, y, r });
    playMissionIgnition();
    timer.current = window.setTimeout(() => {
      setOrigin(null);
      onLaunch();
    }, 720);
  };

  return (
    <>
      <button
        type="button"
        className={`launch-cta ${className}`.trim()}
        onClick={handleClick}
        disabled={disabled || !!origin}
        autoFocus={autoFocus}
      >
        <span className="flame-icon" aria-hidden="true">
          <span className="flame-contrast-halo" />
          <span className="flame flame-outer" />
          <span className="flame flame-mid" />
          <span className="flame flame-core" />
          <motion.svg
            className="flame-svg-live"
            viewBox="0 0 24 28"
            width="20"
            height="24"
            aria-hidden="true"
            animate={{
              scaleX: [1, 0.94, 1.06, 0.97, 1],
              scaleY: [1, 1.08, 0.95, 1.06, 1],
              rotate: [0, -2.5, 2.5, -1.5, 0],
            }}
            transition={{
              duration: 1.15,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            {/* Outer high-contrast dark-rimmed crimson flame */}
            <path
              d="M12 1.5C12 1.5 19.8 8.8 19.8 16.4C19.8 21.4 16.3 25.5 12 25.5C7.7 25.5 4.2 21.4 4.2 16.4C4.2 11.8 7.4 7.3 9.2 5.2C9.0 7.6 10.3 9.1 10.3 9.1C10.0 5.6 12 1.5 12 1.5Z"
              fill="#FF4518"
              stroke="#1D1C1A"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            {/* Mid vivid amber-orange flame tongue */}
            <path
              d="M12 6.2C12 6.2 16.8 11.4 16.8 16.8C16.8 20.4 14.7 23.4 12 23.4C9.3 23.4 7.2 20.4 7.2 16.8C7.2 13.0 12 6.2 12 6.2Z"
              fill="#FFA000"
              stroke="#7A1B12"
              strokeWidth="0.9"
              strokeLinejoin="round"
            />
            {/* Inner incandescent gold-white core */}
            <path
              d="M12 11.5C12 11.5 14.6 14.8 14.6 18.0C14.6 20.3 13.4 22.0 12 22.0C10.6 22.0 9.4 20.3 9.4 18.0C9.4 14.8 12 11.5 12 11.5Z"
              fill="#FFF8CC"
            />
            {/* Rising micro-sparks */}
            <circle className="flame-ember flame-ember-1" cx="7.5" cy="6.5" r="1.3" fill="#FFE082" stroke="#1D1C1A" strokeWidth="0.6" />
            <circle className="flame-ember flame-ember-2" cx="16.8" cy="7.2" r="1.2" fill="#FFAB00" stroke="#1D1C1A" strokeWidth="0.6" />
            <circle className="flame-ember flame-ember-3" cx="12.2" cy="2.2" r="1.1" fill="#FFF8CC" stroke="#7A1B12" strokeWidth="0.6" />
          </motion.svg>
        </span>
        <span>{label}</span>
      </button>

      {origin &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="flame-spread-editorial" aria-hidden="true" data-testid="flame-spread">
            <svg width="0" height="0" style={{ position: "absolute" }}>
              <filter id="editorial-flame-edge">
                <feTurbulence type="fractalNoise" baseFrequency="0.018 0.032" numOctaves="3" seed="7" />
                <feDisplacementMap in="SourceGraphic" scale="48" />
              </filter>
            </svg>
            {/* High-contrast backdrop flash so the flame wavefront stands out sharply */}
            <div
              className="spread-backdrop-flash"
              style={
                {
                  "--ox": `${origin.x}px`,
                  "--oy": `${origin.y}px`,
                } as React.CSSProperties
              }
            />
            {/* Primary high-contrast crimson + charcoal + vermilion + amber combustion wavefront */}
            <div
              className="spread-ring spread-ring-outer"
              style={{
                left: origin.x - origin.r,
                top: origin.y - origin.r,
                width: origin.r * 2,
                height: origin.r * 2,
              }}
            />
            {/* Secondary turbulent amber-vermilion thermal wave */}
            <div
              className="spread-ring spread-ring-mid"
              style={{
                left: origin.x - origin.r * 0.92,
                top: origin.y - origin.r * 0.92,
                width: origin.r * 1.84,
                height: origin.r * 1.84,
              }}
            />
            {/* Expanding Framer Motion radial flame crown */}
            <motion.svg
              className="spread-crown-svg"
              viewBox="-120 -120 240 240"
              style={{
                left: origin.x - origin.r * 0.85,
                top: origin.y - origin.r * 0.85,
                width: origin.r * 1.7,
                height: origin.r * 1.7,
              }}
              initial={{ scale: 0.04, opacity: 1, rotate: 0 }}
              animate={{ scale: 1.08, opacity: 0, rotate: 18 }}
              transition={{ duration: 0.66, ease: [0.22, 1, 0.36, 1] }}
            >
              {CROWN_TONGUES.map((deg) => (
                <g key={deg} transform={`rotate(${deg})`}>
                  <path
                    d="M -7 -58 C -12 -82, -4 -98, 0 -114 C 4 -98, 12 -82, 7 -58 Z"
                    fill="#D9381E"
                    stroke="#1D1C1A"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M -4 -62 C -7 -78, -2 -90, 0 -102 C 2 -90, 7 -78, 4 -62 Z"
                    fill="#FBBF24"
                  />
                </g>
              ))}
            </motion.svg>
            {/* Warm paper reveal ring with glowing crimson/amber rim */}
            <div
              className="spread-ring spread-ring-paper"
              style={{
                left: origin.x - origin.r,
                top: origin.y - origin.r,
                width: origin.r * 2,
                height: origin.r * 2,
              }}
            />
            {SPARKS.map((i) => {
              const a = (i / SPARKS.length) * Math.PI * 2 + (i % 3) * 0.22;
              const d = 120 + (i % 5) * 68;
              const size = 6 + (i % 3) * 3;
              const isAmber = i % 2 === 0;
              return (
                <span
                  key={i}
                  className={`spread-spark-ed ${isAmber ? "spark-amber" : "spark-crimson"}`}
                  style={
                    {
                      left: origin.x,
                      top: origin.y,
                      width: `${size}px`,
                      height: `${size}px`,
                      marginLeft: `${-size / 2}px`,
                      marginTop: `${-size / 2}px`,
                      "--tx": `${Math.cos(a) * d}px`,
                      "--ty": `${Math.sin(a) * d - 42}px`,
                    } as React.CSSProperties
                  }
                />
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
