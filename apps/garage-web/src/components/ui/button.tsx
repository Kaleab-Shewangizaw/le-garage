import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13.5px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
  {
    variants: {
      variant: {
        primary: "bg-ink text-paper hover:bg-ink/85 active:bg-ink/90",
        signal: "bg-signal text-paper hover:bg-signal-hover",
        secondary: "bg-surface text-ink border border-line hover:bg-paper shadow-subtle",
        ghost: "text-ink hover:bg-black/[0.04]",
        danger: "bg-danger text-paper hover:bg-danger/90",
        link: "text-ink underline underline-offset-4 hover:text-graphite",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-4",
        lg: "h-11 px-5 text-[14.5px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    // Radix's Slot clones props onto exactly one child element — it
    // throws if given more than one node (e.g. a loading spinner sibling
    // alongside the real child), so asChild usage (Button wrapping a
    // Next <Link>, typically) must pass `children` through untouched.
    // `disabled` is likewise button-specific and meaningless on an <a>.
    if (asChild) {
      return (
        <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} disabled={disabled || loading} {...props}>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
