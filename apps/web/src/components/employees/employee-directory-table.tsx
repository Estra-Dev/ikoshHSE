"use client";

import Link from "next/link";
import type { EmployeeBasic } from "@/lib/api/types";
import {
  Table,
  TableBody,
  TD,
  TH,
  TableRow,
  TableHead,
} from "@/components/ui/table";

function formatName(employee: EmployeeBasic): string {
  const name = `${employee.firstName} ${employee.lastName}`.trim();
  return name || "Unnamed employee";
}

/**
 * Directory result table. Shows basic profile information only; sensitive
 * employment and administrative fields live on the profile page, where the
 * server decides what the viewer may see.
 */
export function EmployeeDirectoryTable({
  employees,
}: {
  employees: EmployeeBasic[];
}) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TH scope="col">Name</TH>
          <TH scope="col">Job title</TH>
          <TH scope="col">Department</TH>
          <TH scope="col">Email</TH>
          <TH scope="col">Phone</TH>
        </TableRow>
      </TableHead>
      <TableBody>
        {employees.map((employee) => (
          <TableRow key={employee.id}>
            <TD className="font-medium text-ink">
              <Link
                href={`/employees/${employee.id}`}
                className="text-navy-700 hover:text-navy-900 hover:underline"
              >
                {formatName(employee)}
              </Link>
            </TD>
            <TD className="text-muted">
              {employee.jobTitle ?? "—"}
            </TD>
            <TD className="text-muted">
              {employee.department?.name ?? "—"}
            </TD>
            <TD className="text-muted">
              {employee.email}
            </TD>
            <TD className="whitespace-nowrap text-muted">
              {employee.phone ?? "—"}
            </TD>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
