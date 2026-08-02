import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { ProfileForm } from "../profile-form";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  const devAuthBypass =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_SKIP_LINE_AUTH === "true";

  if (!user.loggedIn && !devAuthBypass) {
    redirect("/entry");
  }
  if (user.profileCompleted) {
    redirect("/profile");
  }

  return <ProfileForm mode="register" />;
}
