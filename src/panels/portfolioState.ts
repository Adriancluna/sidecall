// Incidents are supplied newest first by the live query. Never use a retained
// recovery record as the default incident, and never let a history selection
// conceal a newly arrived report.
export type IncidentSelection = { id: string; newestId?: string; history: boolean };
export function selectPortfolioIncident<T extends { _id: string; containedAt: number | null }>(
  incidents: T[], chosen?: IncidentSelection,
): T | undefined {
  const picked = chosen?.newestId === incidents[0]?._id
    ? incidents.find(i => i._id === chosen?.id) : undefined;
  return picked && (picked.containedAt === null || chosen?.history)
    ? picked : incidents.find(i => i.containedAt === null);
}
