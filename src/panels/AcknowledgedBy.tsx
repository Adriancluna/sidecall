// "Acknowledged by Rosa Alvarez": who won the two-browser race (exposures carry acknowledgedBy).
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function AcknowledgedBy({ userId, nameOnly = false }: { userId?: Id<"users"> | null; nameOnly?: boolean }) {
  const users = useQuery(api.blastRadius.listUsers, {});
  if (!userId) return null;
  const name = users?.find((u) => u._id === userId)?.name;
  return (
    <span className="text-sm text-ok">
      {nameOnly ? (name ?? "A teammate") : `Acknowledged by ${name ?? "a teammate"}`}
    </span>
  );
}

// PE view: alerts don't carry the exposure, so read acknowledgedBy from its evidence.
export function ExposureAcknowledgedBy({
  exposureId,
}: {
  exposureId: Id<"exposures">;
}) {
  const evidence = useQuery(api.blastRadius.getExposureEvidence, {
    exposureId,
  });
  return <AcknowledgedBy userId={evidence?.acknowledgedBy} />;
}
