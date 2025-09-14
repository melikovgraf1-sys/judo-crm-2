// @flow
import React from "react";

export default function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full overflow-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <table className="w-full text-sm">
        {children}
      </table>
    </div>
  );
}
