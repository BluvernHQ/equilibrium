"use client";

import React, { createContext, useCallback, useContext, useState } from "react";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState>({
    open: false,
    title: "",
    message: "",
    confirmLabel: "OK",
    cancelLabel: "Cancel",
  });

  const resolverRef = React.useRef<((value: boolean) => void) | null>(null);

  const close = useCallback((result: boolean) => {
    setState((prev) => ({ ...prev, open: false }));
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({
        open: true,
        title: options.title || "Are you sure?",
        message: options.message,
        confirmLabel: options.confirmLabel || "OK",
        cancelLabel: options.cancelLabel || "Cancel",
      });
    });
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state.open && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="px-6 pt-5 pb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {state.title}
              </h2>
              <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">
                {state.message}
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-3">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                {state.cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className="rounded-lg bg-[#00A3AF] px-4 py-2 text-sm font-medium text-white hover:bg-[#008C97]"
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx;
}

