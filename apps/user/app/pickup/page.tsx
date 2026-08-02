import { PickupClient } from "./pickup-client";

type PageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default function PickupPage({ searchParams }: PageProps) {
  const rawSenderAddressId = searchParams.senderId;
  const senderAddressId = Array.isArray(rawSenderAddressId)
    ? rawSenderAddressId[0] ?? null
    : rawSenderAddressId ?? null;
  return <PickupClient senderAddressId={senderAddressId} />;
}
