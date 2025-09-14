// @flow
import React from "react";
import Breadcrumbs from "./Breadcrumbs";

export default function AppealsTab() {
  return (
    <div className="space-y-3">
      <Breadcrumbs items={["Обращения"]} />
      <div className="p-3 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        В этом разделе появится чат с клиентами.
      </div>
    </div>
  );
}
