"use client";

import { PageHeader } from "@/app/admin-ui";

export default function PickupsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Pickups" description="Pickup request operations are not active in this phase. Slot setup remains available for future scheduling." />
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
        <h2 className="font-semibold text-amber-950">Workflow disabled</h2>
        <p className="mt-2 text-sm leading-6 text-amber-900">
          Pickup request intake is currently off. Staff can still prepare availability from Pickup slots.
        </p>
      </div>
    </div>
  );
}
