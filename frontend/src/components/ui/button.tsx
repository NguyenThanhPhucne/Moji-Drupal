/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold tracking-[-0.01em] leading-none transition-all disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 disabled:active:scale-100 motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 motion-safe:active:scale-[0.985] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 motion-safe:hover:shadow-[0_12px_24px_-16px_hsl(var(--primary)/0.8)]",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 motion-safe:hover:shadow-[0_12px_24px_-16px_hsl(var(--destructive)/0.8)] focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background text-foreground shadow-xs hover:bg-accent/80 hover:text-foreground motion-safe:hover:shadow-[0_10px_20px_-14px_hsl(var(--foreground)/0.4)] dark:bg-input/30 dark:border-input dark:hover:bg-input/60",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/90 hover:text-foreground motion-safe:hover:shadow-[0_10px_20px_-14px_hsl(var(--foreground)/0.35)]",
        ghost:
          "hover:bg-accent/80 hover:text-foreground dark:hover:bg-accent/60",
        link:
          "text-primary underline-offset-4 hover:underline motion-safe:hover:translate-y-0 motion-safe:active:scale-100",
        completeGhost:
          "hover:bg-transparent motion-safe:hover:translate-y-0 motion-safe:active:scale-100",
        primary:
          "border border-primary text-primary hover:bg-primary dark:hover:text-white hover:text-primary-foreground motion-safe:hover:shadow-[0_12px_24px_-16px_hsl(var(--primary)/0.8)]",
        destructiveOutline:
          "bg-background underline hover:no-underline shadow-xs hover:bg-destructive hover:text-destructive-foreground motion-safe:hover:shadow-[0_12px_24px_-16px_hsl(var(--destructive)/0.72)]",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
