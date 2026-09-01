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

export interface DataTableColumn<Row> {
  id: string;
  header: string;
  cardLabel?: string;
  cell: (row: Row) => ReactNode;
  align?: "start" | "center" | "end";
  priority?: "primary" | "secondary";
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
  ...props
}: DataTableProps<Row>) {
  return (
    <div className={classNames("cjs-data-table", containerClassName)}>
      <table className={classNames("cjs-table", className)} {...props}>
        <caption className={captionVisible ? undefined : "cjs-visually-hidden"}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} scope="col" data-align={column.align ?? "start"}>
                {column.header}
              </th>
            ))}
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
