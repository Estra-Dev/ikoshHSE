import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-full text-left text-sm">{children}</table>
      </div>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-line bg-navy-50/60 text-[11px] uppercase tracking-[0.12em] text-muted">
      {children}
    </thead>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
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
          ? "cursor-pointer transition hover:bg-navy-50/50"
          : "transition hover:bg-navy-50/30"
      }
    >
      {children}
    </tr>
  );
}

export function TH(props: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th {...props} className="px-4 py-3 font-semibold" />;
}

export function TD(props: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} className="px-4 py-3 align-middle" />;
}
