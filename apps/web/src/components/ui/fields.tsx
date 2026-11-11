import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const FIELD_CLASSES =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink shadow-sm transition placeholder:text-slate-400 hover:border-navy-200 focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-600/15 disabled:cursor-not-allowed disabled:bg-navy-50/60";

const ERROR_CLASSES =
  "border-red-300 hover:border-red-400 focus:border-red-500 focus:ring-red-500/20";

const LABEL_CLASSES =
  "mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-muted";

interface FieldExtras {
  hint?: string;
  error?: string;
}

function fieldClass(error?: string, className = ""): string {
  return `${FIELD_CLASSES} ${error ? ERROR_CLASSES : ""} ${className}`;
}

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids = [error ? `${id}-error` : "", hint ? `${id}-hint` : ""].filter(
    Boolean,
  );

  return ids.length > 0 ? ids.join(" ") : undefined;
}

function FieldMessage({
  id,
  hint,
  error,
}: {
  id: string;
  hint?: string;
  error?: string;
}) {
  if (error) {
    return (
      <p id={`${id}-error`} className="mt-1 text-xs text-red-600">
        {error}
      </p>
    );
  }

  if (hint) {
    return (
      <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
        {hint}
      </p>
    );
  }

  return null;
}

export function TextField({
  label,
  id,
  className = "",
  hint,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  id: string;
} & FieldExtras) {
  return (
    <label htmlFor={id} className="block">
      <span className={LABEL_CLASSES}>{label}</span>
      <input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={fieldClass(error, className)}
      />
      <FieldMessage id={id} hint={hint} error={error} />
    </label>
  );
}

export function SelectField({
  label,
  id,
  options,
  className = "",
  children,
  hint,
  error,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  id: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
} & FieldExtras) {
  return (
    <label htmlFor={id} className="block">
      <span className={LABEL_CLASSES}>{label}</span>
      <select
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={fieldClass(error, className)}
      >
        {options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
      <FieldMessage id={id} hint={hint} error={error} />
    </label>
  );
}

export function TextareaField({
  label,
  id,
  className = "",
  hint,
  error,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  id: string;
} & FieldExtras) {
  return (
    <label htmlFor={id} className="block">
      <span className={LABEL_CLASSES}>{label}</span>
      <textarea
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={fieldClass(error, className)}
      />
      <FieldMessage id={id} hint={hint} error={error} />
    </label>
  );
}
