import { PickupRegisterClient } from "./pickup-register-client";

type PageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default function PickupRegisterPage({ searchParams }: PageProps) {
  const rawSenderAddressId = searchParams.senderId;
  const senderAddressId = Array.isArray(rawSenderAddressId)
    ? rawSenderAddressId[0] ?? null
    : rawSenderAddressId ?? null;
  return <PickupRegisterClient senderAddressId={senderAddressId} />;
}
