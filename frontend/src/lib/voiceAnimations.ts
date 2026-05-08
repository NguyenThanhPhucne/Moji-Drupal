import { cn } from "@/lib/utils";

/**
 * Enterprise-grade animation utilities for voice memo UI
 * Provides smooth transitions, micro-interactions, and accessibility-aware animations
 */

/**
 * Smooth reveal animation for recording UI
 * Fades in and slides from right with proper easing
 */
export const recordingRevealClass = cn(
  "animate-in fade-in slide-in-from-right-2 duration-300",
);

/**
 * Smooth hide animation for recording UI
 * Fades out and slides to right with proper easing
 */
export const recordingHideClass = cn(
  "animate-out fade-out slide-out-to-right-2 duration-200",
);

/**
 * Smooth reveal animation for player
 * Gentle fade-in with slight scale
 */
export const playerRevealClass = cn(
  "animate-in fade-in zoom-in-95 duration-200",
);

/**
 * Pulsing animation for recording indicator
 * Multi-layer pulse with ring effect
 */
export const recordingIndicatorClass = cn(
  "relative",
  // Outer ring: expanding pulse
  "before:absolute before:inset-0 before:rounded-full",
  "before:bg-destructive/20 before:animate-ping",
  // Middle: opacity pulse
  "after:absolute after:inset-0 after:rounded-full",
  "after:bg-destructive/40 after:animate-pulse",
);

/**
 * Smooth button press effect
 * Scales down slightly on active, with spring-like easing
 */
export const buttonPressClass = "active:scale-95 transition-transform duration-100";

/**
 * Hover elevation effect for buttons
 * Adds shadow on hover for 3D appearance
 */
export const buttonHoverElevationClass = cn(
  "hover:shadow-md hover:-translate-y-0.5 transition-all duration-200",
);

/**
 * Focus ring animation
 * Smooth color transition on focus
 */
export const focusRingAnimationClass = cn(
  "focus:ring-2 focus:ring-primary/50 focus:outline-none transition-shadow duration-200",
);

/**
 * Loading bar animation with shimmer
 * Smooth infinite progress bar with gradient
 */
export const loadingBarShimmerClass = cn(
  "relative overflow-hidden",
  "before:absolute before:inset-0 before:bg-gradient-to-r",
  "before:from-transparent before:via-white/20 before:to-transparent",
  "before:animate-shimmer",
);

/**
 * Skeleton loading animation
 * Gentle pulse with proper accessibility
 */
export const skeletonPulseClass = cn(
  "animate-pulse opacity-60",
  "motion-safe:animate-pulse motion-reduce:animate-none",
);

/**
 * Waveform bar animation
 * Smooth height transition with easing
 */
export const waveformBarAnimationClass = cn(
  "transition-[height] duration-100 ease-out",
  "motion-safe:duration-100 motion-reduce:duration-0",
);

/**
 * Error state shake animation
 * Subtle horizontal shake for error alerts
 */
export const errorShakeClass = cn(
  "animate-shake",
);

/**
 * Success state bounce animation
 * Quick bounce for positive feedback
 */
export const successBounceClass = cn(
  "animate-bounce duration-700",
);

/**
 * Spinner animation for loading states
 * Smooth continuous rotation
 */
export const spinnerAnimationClass = cn(
  "animate-spin",
);

/**
 * Fade-in-up animation for list items
 * Cascading reveal effect
 */
export const fadeInUpClass = cn(
  "animate-in fade-in slide-in-from-bottom-2 duration-300",
);

/**
 * Responsive animation: Slower on mobile, faster on desktop
 * Improves perceived performance on slower devices
 */
export const responsiveAnimationClass = cn(
  "duration-300 sm:duration-200",
);

/**
 * Custom animation keyframes (add to global CSS)
 */
export const animationStyleSheet = `
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
  }

  .animate-shimmer {
    animation: shimmer 2s infinite;
  }

  .animate-shake {
    animation: shake 0.5s cubic-bezier(0.36, 0, 0.66, -0.56);
  }

  .motion-safe\\:animate-pulse {
    @media (prefers-reduced-motion: no-preference) {
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
  }

  .motion-reduce\\:animate-none {
    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
  }

  /* Smooth transitions for all interactive elements */
  button, [role="button"], input, textarea {
    @apply transition-all duration-200;
  }

  /* Focus management - visible outline */
  *:focus-visible {
    outline: 2px solid rgb(var(--color-primary));
    outline-offset: 2px;
  }
`;

/**
 * Tailwind config additions for animations
 */
export const tailwindAnimationConfig = {
  extend: {
    animation: {
      shimmer: "shimmer 2s infinite",
      shake: "shake 0.5s cubic-bezier(0.36, 0, 0.66, -0.56)",
      "pulse-subtle": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
    },
    keyframes: {
      shimmer: {
        "0%": { transform: "translateX(-100%)" },
        "100%": { transform: "translateX(100%)" },
      },
      shake: {
        "0%, 100%": { transform: "translateX(0)" },
        "25%": { transform: "translateX(-4px)" },
        "75%": { transform: "translateX(4px)" },
      },
    },
    transitionTimingFunction: {
      "ease-spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
    },
  },
};

/**
 * Responsive utility: Only animate on devices that support it
 */
export const respectReducedMotion = (animationClass: string) => cn(
  "motion-safe:" + animationClass,
  "motion-reduce:transition-none",
);

/**
 * Gesture-aware class for touch feedback
 * Scales up slightly on touch for feedback
 */
export const touchFeedbackClass = cn(
  "active:scale-95 active:duration-75",
  "touch:active:scale-98 touch:active:duration-100",
);

/**
 * Loading state cascade animation
 * Shows multiple skeleton elements with staggered reveal
 */
export function getCascadeAnimationDelay(index: number, baseDelay: number = 50): string {
  return `animation-delay: ${index * baseDelay}ms`;
}

/**
 * Creates staggered animation classes for list items
 */
export const getStaggeredAnimationClass = (index: number) => cn(
  fadeInUpClass,
  `style={{ animationDelay: '${index * 30}ms' }}`,
);
