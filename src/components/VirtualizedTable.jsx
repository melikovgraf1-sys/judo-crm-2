// @flow
import React, { useMemo, forwardRef } from "react";
import { FixedSizeList } from "react-window";

const TBody = forwardRef<HTMLTableSectionElement, any>((props, ref) => (
  <tbody ref={ref} {...props} />
));

export default function VirtualizedTable({
  header,
  items,
  rowHeight,
  height = 400,
  renderRow,
}: {
  header: React.Node,
  items: any[],
  rowHeight: number,
  height?: number,
  renderRow: (item: any, style: any) => React.Node,
}) {
  const Outer = useMemo(
    () =>
      forwardRef<HTMLTableElement, any>(({ style, children, ...rest }, ref) => (
        <table
          {...rest}
          ref={ref}
          style={style}
          className="w-full text-sm"
        >
          {header}
          {children}
        </table>
      )),
    [header]
  );

  return (
    <div className="w-full overflow-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <FixedSizeList
        height={height}
        itemCount={items.length}
        itemSize={rowHeight}
        width="100%"
        outerElementType={Outer}
        innerElementType={TBody}
      >
        {({ index, style }) => renderRow(items[index], style)}
      </FixedSizeList>
    </div>
  );
}
