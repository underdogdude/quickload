import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { ProfileForm } from "../../profile-form";

export default async function ProfileEditPage() {
  const user = await getCurrentUser();
  const devAuthBypass =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_SKIP_LINE_AUTH === "true";

  if (!user.loggedIn && !devAuthBypass) {
    redirect("/entry");
  }
  if (!user.profileCompleted && !devAuthBypass) {
    redirect("/register");
  }

  return <ProfileForm mode="edit" />;
}
