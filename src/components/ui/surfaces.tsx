import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { HTMLAttributes, Key, ReactNode, TableHTMLAttributes } from "react";
import { classNames } from "./classNames";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "information";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: ReactNode;
}

export function Badge({ children, className, icon, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span className={classNames("cjs-badge", className)} data-tone={tone} {...props}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}

export type SurfacePadding = "none" | "small" | "medium" | "large";
export type SurfaceVariant = "default" | "strong" | "warm";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  padding?: SurfacePadding;
  variant?: SurfaceVariant;
}

export function Panel({
  className,
  padding = "medium",
  variant = "default",
  ...props
}: PanelProps) {
  return (
    <div
      className={classNames("cjs-panel", className)}
      data-padding={padding}
      data-variant={variant}
      {...props}
    />
  );
}

export interface CardProps extends HTMLAttributes<HTMLElement> {
  padding?: SurfacePadding;
  variant?: SurfaceVariant;
}

export function Card({ className, padding = "medium", variant = "default", ...props }: CardProps) {
  return (
    <article
      className={classNames("cjs-card", className)}
      data-padding={padding}
      data-variant={variant}
      {...props}
    />
  );
}

export type SortOrder = "asc" | "desc";

export interface SortableHeaderProps<SortKey extends string> {
  label: string;
  sortKey: SortKey;
  activeSort: SortKey;
  order: SortOrder;
  defaultOrder: SortOrder;
  onSort: (key: SortKey) => void;
  align?: "start" | "center" | "end";
}

export function SortableHeader<SortKey extends string>({
  activeSort,
  align = "start",
  defaultOrder,
  label,
  onSort,
  order,
  sortKey,
}: SortableHeaderProps<SortKey>) {
  const active = activeSort === sortKey;
  const nextOrder = active ? (order === "asc" ? "desc" : "asc") : defaultOrder;

  return (
    <th
      scope="col"
      aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}
      data-align={align}
    >
      <button
        type="button"
        className="cjs-table__sort-button"
        aria-label={`Sort by ${label.toLocaleLowerCase()}, ${nextOrder === "asc" ? "ascending" : "descending"}`}
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        {active ? (
          order === "asc" ? (
            <ArrowUp size={14} aria-hidden="true" />
          ) : (
            <ArrowDown size={14} aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown size={14} aria-hidden="true" />
        )}
      </button>
    </th>
  );
}

export interface DataTableColumn<Row> {
  id: string;
  header: string;
  cardLabel?: string;
  cell: (row: Row) => ReactNode;
  align?: "start" | "center" | "end";
  priority?: "primary" | "secondary";
  sortKey?: string;
  defaultOrder?: SortOrder;
}

export interface DataTableProps<Row> extends Omit<
  TableHTMLAttributes<HTMLTableElement>,
  "children"
> {
  caption: string;
  captionVisible?: boolean;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  getRowKey: (row: Row) => Key;
  getRowLabel?: (row: Row) => string;
  emptyMessage?: string;
  containerClassName?: string;
  sort?: { key: string; order: SortOrder; onSort: (key: string) => void };
}

export function DataTable<Row>({
  caption,
  captionVisible = false,
  className,
  columns,
  containerClassName,
  emptyMessage = "No results",
  getRowKey,
  getRowLabel,
  rows,
  sort,
  ...props
}: DataTableProps<Row>) {
  return (
    <div className={classNames("cjs-data-table", containerClassName)}>
      <table className={classNames("cjs-table", className)} {...props}>
        <caption className={captionVisible ? undefined : "cjs-visually-hidden"}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) =>
              sort && column.sortKey ? (
                <SortableHeader
                  key={column.id}
                  label={column.header}
                  sortKey={column.sortKey}
                  activeSort={sort.key}
                  order={sort.order}
                  defaultOrder={column.defaultOrder ?? "asc"}
                  onSort={sort.onSort}
                  align={column.align}
                />
              ) : (
                <th key={column.id} scope="col" data-align={column.align ?? "start"}>
                  {column.header}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="cjs-table__empty" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={getRowKey(row)} aria-label={getRowLabel?.(row)}>
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className="cjs-table__cell"
                    data-label={column.cardLabel ?? column.header}
                    data-align={column.align ?? "start"}
                    data-priority={column.priority ?? "secondary"}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
