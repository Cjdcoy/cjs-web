import { ChevronLeft, ChevronRight } from "lucide-react";
import { VisuallyHidden } from "./VisuallyHidden";

type PageItem = number | "ellipsis-start" | "ellipsis-end";

function pageItems(page: number, pageCount: number): PageItem[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  if (page <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis-end", pageCount];
  }

  if (page >= pageCount - 3) {
    return [
      1,
      "ellipsis-start",
      pageCount - 4,
      pageCount - 3,
      pageCount - 2,
      pageCount - 1,
      pageCount,
    ];
  }

  return [1, "ellipsis-start", page - 1, page, page + 1, "ellipsis-end", pageCount];
}

export interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  ariaLabel?: string;
  className?: string;
}

export function Pagination({
  ariaLabel = "Pagination",
  className,
  onPageChange,
  page,
  pageCount,
}: PaginationProps) {
  if (pageCount < 1) {
    return null;
  }

  const currentPage = Math.min(Math.max(page, 1), pageCount);

  return (
    <nav className={className} aria-label={ariaLabel}>
      <div className="cjs-pagination">
        <button
          type="button"
          className="cjs-pagination__button"
          disabled={currentPage === 1}
          aria-label="Previous page"
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <ol className="cjs-pagination__pages">
          {pageItems(currentPage, pageCount).map((item) =>
            typeof item === "number" ? (
              <li key={item} data-current={item === currentPage || undefined}>
                <button
                  type="button"
                  className="cjs-pagination__button"
                  aria-label={`Page ${item}`}
                  aria-current={item === currentPage ? "page" : undefined}
                  onClick={() => onPageChange(item)}
                >
                  {item}
                </button>
              </li>
            ) : (
              <li key={item} className="cjs-pagination__ellipsis" aria-hidden="true">
                …
              </li>
            ),
          )}
        </ol>
        <button
          type="button"
          className="cjs-pagination__button"
          disabled={currentPage === pageCount}
          aria-label="Next page"
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <VisuallyHidden aria-live="polite">
          Page {currentPage} of {pageCount}
        </VisuallyHidden>
      </div>
    </nav>
  );
}
