import { WorkJournal } from "../work-journal";

export default async function EmployeeWorkJournalPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  return <WorkJournal targetEmployeeId={employeeId} />;
}
