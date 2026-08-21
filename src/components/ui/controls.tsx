import {
  forwardRef,
  useId,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { classNames } from "./classNames";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ControlSize = "small" | "medium" | "large";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  isLoading?: boolean;
  loadingLabel?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    disabled,
    isLoading = false,
    loadingLabel,
    size = "medium",
    type = "button",
    variant = "primary",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={classNames("cjs-button", className)}
      data-size={size}
      data-variant={variant}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading && <span className="cjs-button__spinner" aria-hidden="true" />}
      <span className="cjs-button__label">
        {isLoading && loadingLabel ? loadingLabel : children}
      </span>
    </button>
  );
});

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  variant?: "default" | "muted" | "player" | "standalone";
  isDisabled?: boolean;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  {
    children,
    className,
    href,
    isDisabled = false,
    onClick,
    tabIndex,
    variant = "default",
    ...props
  },
  ref,
) {
  return (
    <a
      ref={ref}
      href={href}
      className={classNames("cjs-link", className)}
      data-variant={variant}
      aria-disabled={isDisabled || undefined}
      tabIndex={isDisabled ? -1 : tabIndex}
      onClick={(event) => {
        if (isDisabled) {
          event.preventDefault();
          return;
        }

        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </a>
  );
});

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label"
> {
  label: string;
  variant?: "secondary" | "ghost" | "danger";
  size?: ControlSize;
  isLoading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    children,
    className,
    disabled,
    isLoading = false,
    label,
    size = "medium",
    title,
    type = "button",
    variant = "secondary",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={classNames("cjs-icon-button", className)}
      data-size={size}
      data-variant={variant}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      aria-label={label}
      title={title ?? label}
      {...props}
    >
      {isLoading ? <span className="cjs-icon-button__spinner" aria-hidden="true" /> : children}
    </button>
  );
});

interface FieldPresentationProps {
  label: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
}

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size">, FieldPresentationProps {
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    "aria-describedby": describedBy,
    className,
    containerClassName,
    error,
    helperText,
    id,
    label,
    leading,
    required,
    trailing,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? `cjs-input-${generatedId}`;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const description = [describedBy, helperText ? helperId : undefined, error ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames("cjs-field", containerClassName)}>
      <label className="cjs-field__label" htmlFor={inputId}>
        {label}
        {required && (
          <span className="cjs-field__required" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <span className="cjs-field__control">
        {leading && (
          <span className="cjs-field__adornment" data-position="leading" aria-hidden="true">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={classNames("cjs-input", className)}
          data-leading={Boolean(leading) || undefined}
          data-trailing={Boolean(trailing) || undefined}
          required={required}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={description || undefined}
          {...props}
        />
        {trailing && (
          <span className="cjs-field__adornment" data-position="trailing" aria-hidden="true">
            {trailing}
          </span>
        )}
      </span>
      {helperText && (
        <p className="cjs-field__message" id={helperId}>
          {helperText}
        </p>
      )}
      {error && (
        <p className="cjs-field__message" id={errorId} data-tone="danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

export interface SelectProps
  extends SelectHTMLAttributes<HTMLSelectElement>, FieldPresentationProps {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    "aria-describedby": describedBy,
    children,
    className,
    containerClassName,
    error,
    helperText,
    id,
    label,
    required,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? `cjs-select-${generatedId}`;
  const helperId = `${selectId}-helper`;
  const errorId = `${selectId}-error`;
  const description = [describedBy, helperText ? helperId : undefined, error ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames("cjs-field", containerClassName)}>
      <label className="cjs-field__label" htmlFor={selectId}>
        {label}
        {required && (
          <span className="cjs-field__required" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <select
        ref={ref}
        id={selectId}
        className={classNames("cjs-select", className)}
        required={required}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={description || undefined}
        {...props}
      >
        {children}
      </select>
      {helperText && (
        <p className="cjs-field__message" id={helperId}>
          {helperText}
        </p>
      )}
      {error && (
        <p className="cjs-field__message" id={errorId} data-tone="danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
