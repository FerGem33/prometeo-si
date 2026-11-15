import type { CSSProperties } from "react";
import { motion } from "framer-motion";

export interface CampfireFlameProps {
  /** Preset size of the campfire loader */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Dynamic intensity multiplier (e.g. scaled from O2 % or pressure, default 1) */
  intensity?: number;
  /** Visual framing: 'badge' adds a dark charcoal/crimson hearth medallion, 'hearth' uses a dark ambient halo, 'inline' is compact for buttons */
  variant?: "badge" | "hearth" | "inline";
  /** Optional caption shown next to or under the flame */
  label?: string;
  /** Optional secondary telemetry line */
  sublabel?: string;
  className?: string;
}

const SIZE_EM: Record<NonNullable<CampfireFlameProps["size"]>, string> = {
  xs: "3.1px",
  sm: "10px",
  md: "15px",
  lg: "20px",
  xl: "26px",
};

/**
 * High-contrast multi-tongue flame animation derived from `Animacion/llama.html` & `Animacion/llama.css`
 * (.campfire-loader -> .fire-container, .flame-main, .flame-left, .flame-right, .logs, .embers, .sparkles)
 * enhanced with Framer Motion and Option A's dark charcoal/crimson combustion halo so it stands out
 * sharply on the soft gray paper palette.
 */
export function CampfireFlame({
  size = "md",
  intensity = 1,
  variant = "badge",
  label,
  sublabel,
  className = "",
}: CampfireFlameProps) {
  const clamped = Math.max(0.65, Math.min(1.55, intensity));
  const durationScale = 1 / Math.sqrt(clamped);

  const rootStyle = {
    fontSize: SIZE_EM[size],
    "--cf-intensity": clamped,
  } as CSSProperties;

  return (
    <div
      className={`campfire-wrap campfire-wrap--${variant} campfire-wrap--${size} ${className}`.trim()}
      aria-hidden={!label}
    >
      <div className={`campfire-loader campfire-loader--${variant}`} style={rootStyle}>
        {/* Option A dark charcoal + crimson combustion halo so golden/orange tongues pop */}
        <div className="campfire-contrast-halo" />

        <motion.div
          className="sparkles"
          animate={{
            opacity: [0.55, 0.95, 0.65],
            scale: [0.96, 1.08 * clamped, 0.98],
          }}
          transition={{
            duration: 2 * durationScale,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <div className="fire-container">
          {/* Outer crimson-amber thermal shroud */}
          <motion.div
            className="flame flame-shroud"
            animate={{
              scaleY: [0.96, 1.12 * clamped, 0.94, 1.06 * clamped, 0.96],
              scaleX: [1.0, 0.94, 1.04, 0.97, 1.0],
              rotate: [-1.5, 1.5, -1, 1.2, -1.5],
            }}
            transition={{
              duration: 1.45 * durationScale,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Left tongue (.flame-left from Animacion/llama.css) */}
          <motion.div
            className="flame flame-left"
            animate={{
              scaleY: [0.95, 1.1 * clamped, 0.92, 1.06 * clamped, 0.95],
              rotate: [-16, -12, -18, -13, -16],
              y: [0, -2, 0.5, -1.5, 0],
            }}
            transition={{
              duration: 1.35 * durationScale,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.15,
            }}
          />

          {/* Right tongue (.flame-right from Animacion/llama.css) */}
          <motion.div
            className="flame flame-right"
            animate={{
              scaleY: [0.93, 1.09 * clamped, 0.95, 1.12 * clamped, 0.93],
              rotate: [16, 19, 12, 17, 16],
              y: [0, -1.5, 0.5, -2, 0],
            }}
            transition={{
              duration: 1.4 * durationScale,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.35,
            }}
          />

          {/* Main central tongue (.flame-main from Animacion/llama.css) */}
          <motion.div
            className="flame flame-main"
            animate={{
              scaleY: [1, 1.14 * clamped, 0.95, 1.09 * clamped, 1],
              scaleX: [1, 0.95, 1.04, 0.97, 1],
              rotate: [-2, 2, -1.5, 1.5, -2],
              y: [0, -2.5 * clamped, 0, -1.5 * clamped, 0],
            }}
            transition={{
              duration: 1.5 * durationScale,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Bright white-gold inner core */}
          <motion.div
            className="flame flame-core"
            animate={{
              scaleY: [0.95, 1.16 * clamped, 0.92, 1.08 * clamped, 0.95],
              opacity: [0.88, 1, 0.85, 0.96, 0.88],
            }}
            transition={{
              duration: 1.1 * durationScale,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </div>

        {/* Crossed logs (.logs > .log from Animacion/llama.html) */}
        <div className="logs">
          <div className="log" />
          <div className="log" />
        </div>

        {/* Rising embers (.embers > .ember from Animacion/llama.html) */}
        <div className="embers">
          <div className="ember" style={{ "--delay": "0" } as CSSProperties} />
          <div className="ember" style={{ "--delay": "0.5" } as CSSProperties} />
          <div className="ember" style={{ "--delay": "1" } as CSSProperties} />
          <div className="ember ember--extra" style={{ "--delay": "-0.6" } as CSSProperties} />
        </div>
      </div>

      {(label || sublabel) && (
        <div className="campfire-caption">
          {label && <span className="campfire-label">{label}</span>}
          {sublabel && <span className="campfire-sublabel">{sublabel}</span>}
        </div>
      )}
    </div>
  );
}
