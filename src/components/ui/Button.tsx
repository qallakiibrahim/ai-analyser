import React from 'react';
import { cn } from '@/src/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    const variants = {
      primary:
        'bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(15,23,42,0.12)] hover:bg-primary/92 active:scale-[0.985]',
      secondary:
        'bg-muted text-foreground hover:bg-muted/80 active:scale-[0.985]',
      outline:
        'border border-border bg-card text-foreground shadow-[0_1px_1px_rgba(15,23,42,0.03)] hover:bg-muted/70 hover:border-border/80 active:scale-[0.985]',
      ghost:
        'hover:bg-muted/80 text-muted-foreground hover:text-foreground active:scale-[0.985]',
      danger:
        'bg-rose-600 text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] hover:bg-rose-700 active:scale-[0.985]',
      success:
        'bg-emerald-600 text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] hover:bg-emerald-700 active:scale-[0.985]',
    };

    const sizes = {
      sm: 'h-8.5 px-3.5 text-xs',
      md: 'h-10 px-4 text-sm',
      lg: 'h-11 px-6 text-sm',
      icon: 'h-8.5 w-8.5 p-0',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap shrink-0 transition-[background-color,border-color,color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none gap-2 cursor-pointer',
          variants[variant],
          sizes[size],
          className
        )}
        disabled={isLoading || disabled}
        {...props}
      >
        {isLoading && (
          <span
            aria-hidden="true"
            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
          />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
