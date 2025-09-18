import React from "react";
import { FixedSizeList, ListChildComponentProps } from "react-window";

type TableBodyProps = React.HTMLAttributes<HTMLTableSectionElement> & {
  style: React.CSSProperties;
};

const TableBodyInnerElement = React.forwardRef<HTMLTableSectionElement, TableBodyProps>(({ style, ...rest }, ref) => (
  <tbody
    ref={ref}
    style={{
      ...style,
      position: "relative",
      display: "block",
      minWidth: "100%",
    }}
    {...rest}
  />
));

TableBodyInnerElement.displayName = "TableBodyInnerElement";

type VirtualizedTableProps<T> = {
  header: React.ReactNode;
  items: T[];
  rowHeight: number;
  height?: number;
  renderRow: (item: T, style: React.CSSProperties) => React.ReactNode;
};

export default function VirtualizedTable<T>({
  header,
  items,
  rowHeight,
  height = 400,
  renderRow,
}: VirtualizedTableProps<T>) {
  const OuterElement = React.useMemo(
    () =>
      React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
        ({ children, className, style, ...rest }, ref) => (
          <div
            ref={ref}
            className={`w-full overflow-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 ${
              className ?? ""
            }`}
            style={{ ...style, height, maxHeight: height }}
            {...rest}
          >
            <table className="w-full text-sm">
              {header}
              {children}
            </table>
          </div>
        ),
      ),
    [header, height],
  );

  const renderItem = ({ index, style }: ListChildComponentProps) => {
    const rowStyle: React.CSSProperties = {
      ...style,
      width: "100%",
    };
    return renderRow(items[index], rowStyle);
  };

  return (
    <FixedSizeList
      height={height}
      itemCount={items.length}
      itemSize={rowHeight}
      width="100%"
      outerElementType={OuterElement as unknown as React.ComponentType}
      innerElementType={TableBodyInnerElement as unknown as React.ComponentType}
    >
      {renderItem}
    </FixedSizeList>
  );
}
