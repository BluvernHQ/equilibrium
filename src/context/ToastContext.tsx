"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { getErrorMessage } from "@/lib/errors";

export type ToastType = "success" | "error" | "info";

interface ToastState {
  message: string;
  type: ToastType;
  onClick?: () => void;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, onClick?: () => void) => void;
  toastError: (error: unknown, fallback?: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ToastState | null>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback(
    (message: string, type: ToastType = "info", onClick?: () => void) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setState({ message, type, onClick });
      timeoutRef.current = setTimeout(() => {
        setState(null);
        timeoutRef.current = null;
      }, 5000);
    },
    []
  );

  const toastError = useCallback(
    (error: unknown, fallback = "Something went wrong") => {
      toast(getErrorMessage(error, fallback), "error");
    },
    [toast]
  );

  const dismiss = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setState(null);
  }, []);

  return (
    <ToastContext.Provider value={{ toast, toastError }}>
      {children}
      {state && (
        <div
          role="alert"
          onClick={() => {
            state.onClick?.();
          }}
          className={`fixed top-4 right-4 z-[9999] flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg animate-slide-in max-w-sm ${
            state.type === "success"
              ? "bg-emerald-600 text-white"
              : state.type === "error"
                ? "bg-rose-600 text-white"
                : "bg-gray-800 text-white"
          }`}
        >
          {state.type === "success" && (
            <CheckIcon className="h-5 w-5 shrink-0" aria-hidden />
          )}
          {state.type === "error" && (
            <XMarkIcon className="h-5 w-5 shrink-0" aria-hidden />
          )}
          <span className="text-sm font-medium">{state.message}</span>
          <button
            type="button"
            onClick={dismiss}
            className="ml-1 shrink-0 rounded p-1 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-white/50"
            aria-label="Dismiss"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
