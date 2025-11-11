import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface ProgressIndicatorProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Animated spinner for indicating generation progress
 *
 * Uses Lucide Loader2 icon with spin animation
 */
export function ProgressIndicator({ size = "md", className }: ProgressIndicatorProps) {
  const sizeClasses = {
    sm: "size-4",
    md: "size-6",
    lg: "size-8",
  };

  return <Loader2 className={cn("animate-spin text-primary", sizeClasses[size], className)} aria-label="Ładowanie" />;
}
