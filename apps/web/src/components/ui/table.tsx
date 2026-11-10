import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function Table({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
      {children}
    </thead>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return (
    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {children}
    </tbody>
  );
}

export function TableRow({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={
        onClick
          ? "cursor-pointer transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
          : undefined
      }
    >
      {children}
    </tr>
  );
}

export function TH(props: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th {...props} className="px-4 py-3 font-medium" />;
}

export function TD(props: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} className="px-4 py-3 align-middle" />;
}
