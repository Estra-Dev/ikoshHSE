import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const FIELD_CLASSES =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500";

export function TextField({
  label,
  id,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <input {...props} id={id} className={`${FIELD_CLASSES} ${className}`} />
    </label>
  );
}

export function SelectField({
  label,
  id,
  options,
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  id: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <select {...props} id={id} className={`${FIELD_CLASSES} ${className}`}>
        {options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
    </label>
  );
}

export function TextareaField({
  label,
  id,
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  id: string;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <textarea {...props} id={id} className={`${FIELD_CLASSES} ${className}`} />
    </label>
  );
}
