import { Component, ComponentClass, ComponentType, CSSProperties, FunctionComponent, Key, Ref } from "react";

declare module "react-window" {
  export type CSSDirection = "ltr" | "rtl";
  export type Direction = "vertical" | "horizontal";
  export type Layout = "vertical" | "horizontal";
  export type ScrollDirection = "forward" | "backward";
  export type Align = "auto" | "smart" | "center" | "end" | "start";

  export interface ListChildComponentProps<T = any> {
    index: number;
    style: CSSProperties;
    data: T;
    isScrolling?: boolean | undefined;
  }

  export type ReactElementType =
    | FunctionComponent<any>
    | ComponentClass<any>
    | string;

  export interface CommonProps<T = any> {
    className?: string | undefined;
    innerElementType?: ReactElementType | undefined;
    innerRef?: Ref<any> | undefined;
    innerTagName?: string | undefined;
    itemData?: T | undefined;
    outerElementType?: ReactElementType | undefined;
    outerRef?: Ref<any> | undefined;
    outerTagName?: string | undefined;
    style?: CSSProperties | undefined;
    useIsScrolling?: boolean | undefined;
  }

  export type ListItemKeySelector<T = any> = (index: number, data: T) => Key;

  export interface ListOnItemsRenderedProps {
    overscanStartIndex: number;
    overscanStopIndex: number;
    visibleStartIndex: number;
    visibleStopIndex: number;
  }

  export interface ListOnScrollProps {
    scrollDirection: ScrollDirection;
    scrollOffset: number;
    scrollUpdateWasRequested: boolean;
  }

  export interface ListProps<T = any> extends CommonProps<T> {
    children: ComponentType<ListChildComponentProps<T>>;
    height: number | string;
    itemCount: number;
    width: number | string;
    direction?: CSSDirection | Direction | undefined;
    layout?: Layout | undefined;
    initialScrollOffset?: number | undefined;
    itemKey?: ListItemKeySelector<T> | undefined;
    overscanCount?: number | undefined;
    onItemsRendered?: ((props: ListOnItemsRenderedProps) => any) | undefined;
    onScroll?: ((props: ListOnScrollProps) => any) | undefined;
  }

  export interface FixedSizeListProps<T = any> extends ListProps<T> {
    itemSize: number;
  }

  export class FixedSizeList<T = any> extends Component<FixedSizeListProps<T>> {
    scrollTo(scrollOffset: number): void;
    scrollToItem(index: number, align?: Align): void;
  }
}
