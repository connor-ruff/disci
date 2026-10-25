import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/shared/lib/cn'

type Variant = 'primary' | 'outline' | 'ghost'
type Size = 'md' | 'icon'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  outline: 'border border-border bg-surface hover:bg-highlight',
  ghost: 'hover:bg-highlight',
}

const sizes: Record<Size, string> = {
  md: 'h-11 px-4', // 44px: comfortable touch target
  icon: 'size-11',
}

/** Button styling, also usable on links: <Link className={buttonClasses()}>. */
export function buttonClasses(variant: Variant = 'primary', size: Size = 'md') {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium transition',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    'disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }

export function Button({ variant, size, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonClasses(variant, size), className)} {...props} />
}
