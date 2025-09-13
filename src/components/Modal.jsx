// @flow
import React from "react";

type Props = {
  children: React.ReactNode,
  onClose?: () => void,
  size?: "sm" | "md" | "lg" | "xl",
  className?: string,
};

export default function Modal({ children, onClose, size = "md", className = "" }: Props) {
  const sizeClass = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  }[size];
  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className={`w-full ${sizeClass} rounded-2xl bg-white p-4 space-y-3 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
