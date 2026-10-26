import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Undo toasts stay longer than the 4 s default: people need time to read and reach the button */
export const UNDO_MS = 8000
