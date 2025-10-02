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
  renderRow: (item: T, style: React.CSSProperties) => React.ReactElement;
  virtualize?: boolean;
};

export default function VirtualizedTable<T>({
  header,
  items,
  rowHeight,
  height,
  renderRow,
  virtualize = true,
}: VirtualizedTableProps<T>) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const topScrollRef = React.useRef<HTMLDivElement>(null);
  const bottomScrollRef = React.useRef<HTMLDivElement | null>(null);
  const tableRef = React.useRef<HTMLTableElement | null>(null);
  const syncingRef = React.useRef(false);
  const [measuredHeight, setMeasuredHeight] = React.useState(() => height ?? rowHeight * 8);
  const [viewportWidth, setViewportWidth] = React.useState(0);
  const [tableWidth, setTableWidth] = React.useState(0);

  React.useLayoutEffect(() => {
    if (!virtualize) {
      return;
    }

    if (height != null) {
      setMeasuredHeight(height);
      return;
    }

    const fallback = rowHeight * Math.min(Math.max(items.length, 1), 6);

    const compute = () => {
      const container = containerRef.current;
      if (!container) {
        setMeasuredHeight(prev => (prev > 0 ? prev : fallback));
        return;
      }
      const topHeight = topScrollRef.current?.offsetHeight ?? 0;
      const available = container.clientHeight - topHeight;
      setMeasuredHeight(available > 0 ? available : fallback);
    };

    compute();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", compute);
      return () => window.removeEventListener("resize", compute);
    }

    const observer = new ResizeObserver(() => compute());
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    if (topScrollRef.current) {
      observer.observe(topScrollRef.current);
    }
    return () => observer.disconnect();
  }, [height, items.length, rowHeight, virtualize]);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      setViewportWidth(container.clientWidth);
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  React.useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;

    const updateTableWidth = () => {
      setTableWidth(table.scrollWidth);
    };

    updateTableWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateTableWidth);
      return () => window.removeEventListener("resize", updateTableWidth);
    }

    const observer = new ResizeObserver(() => updateTableWidth());
    observer.observe(table);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const top = topScrollRef.current;
    const bottom = bottomScrollRef.current;
    if (!top || !bottom) {
      return;
    }

    const handleTopScroll = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      bottom.scrollLeft = top.scrollLeft;
      syncingRef.current = false;
    };

    const handleBottomScroll = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      top.scrollLeft = bottom.scrollLeft;
      syncingRef.current = false;
    };

    top.addEventListener("scroll", handleTopScroll, { passive: true });
    bottom.addEventListener("scroll", handleBottomScroll, { passive: true });

    return () => {
      top.removeEventListener("scroll", handleTopScroll);
      bottom.removeEventListener("scroll", handleBottomScroll);
    };
  }, [items.length, tableWidth]);

  const computedHeight = React.useMemo(() => {
    if (!virtualize) {
      return null;
    }
    if (height != null) {
      return height;
    }
    if (measuredHeight > 0) {
      return measuredHeight;
    }
    return rowHeight * Math.min(Math.max(items.length, 1), 6);
  }, [height, items.length, measuredHeight, rowHeight, virtualize]);

  const OuterElement = React.useMemo(() => {
    if (!virtualize) {
      return undefined;
    }
    return React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, forwardedRef) => {
      const { children, className, style, ...rest } = props;
      return (
        <div
          {...rest}
          ref={node => {
            bottomScrollRef.current = node;
            if (typeof forwardedRef === "function") {
              forwardedRef(node);
            } else if (forwardedRef) {
              (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            }
          }}
          className={`h-full w-full overflow-auto [scrollbar-color:_rgba(148,163,184,0.6)_transparent] ${className ?? ""}`}
          style={{ ...style, height: computedHeight ?? undefined, maxHeight: computedHeight ?? undefined }}
        >
          <table
            ref={node => {
              tableRef.current = node;
            }}
            className="w-full min-w-[1200px] text-sm"
          >
            {header}
            {children}
          </table>
        </div>
      );
    });
  }, [computedHeight, header, virtualize]);

  const renderItem = ({ index, style }: ListChildComponentProps) => {
    const rowStyle: React.CSSProperties = {
      ...style,
      width: "100%",
    };
    return renderRow(items[index], rowStyle);
  };

  const scrollWidth = Math.max(tableWidth, viewportWidth);

  return (
    <div
      ref={containerRef}
      className={`flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/70 ${
        virtualize ? "h-full min-h-[200px] overflow-hidden" : ""
      }`}
    >
      <div
        ref={topScrollRef}
        className="overflow-x-auto rounded-t-xl border-b border-slate-200/70 bg-white/80 px-1 py-1 dark:border-slate-700/70 dark:bg-slate-900/70"
      >
        <div style={{ width: scrollWidth || "100%", height: 8 }} />
      </div>
      <div className={virtualize ? "relative flex-1 min-h-0" : "relative"}>
        {virtualize ? (
          <>
            <FixedSizeList
              height={computedHeight ?? rowHeight * Math.min(Math.max(items.length, 1), 6)}
              itemCount={items.length}
              itemSize={rowHeight}
              width="100%"
              outerElementType={OuterElement as unknown as React.ComponentType}
              innerElementType={TableBodyInnerElement as unknown as React.ComponentType}
            >
              {renderItem}
            </FixedSizeList>
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-b from-transparent via-white/80 to-white dark:via-slate-900/70 dark:to-slate-900" />
          </>
        ) : (
          <div
            ref={node => {
              bottomScrollRef.current = node;
            }}
            className="overflow-x-auto rounded-b-xl [scrollbar-color:_rgba(148,163,184,0.6)_transparent]"
          >
            <table
              ref={node => {
                tableRef.current = node;
              }}
              className="w-full min-w-[1200px] text-sm"
            >
              {header}
              <tbody>{items.map(item => renderRow(item, {}))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
