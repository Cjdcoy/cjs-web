import type { HTMLAttributes } from "react";
import { classNames } from "./classNames";

export function VisuallyHidden({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={classNames("cjs-visually-hidden", className)} {...props} />;
}
