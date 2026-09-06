import { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

export function Button({ variant = "primary", className = "", ...rest }: Props) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "bg-accent text-white hover:bg-accentDark",
    secondary: "bg-white text-ink border border-line hover:bg-paper",
    ghost: "text-muted hover:text-ink hover:bg-paper",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...rest} />;
}
