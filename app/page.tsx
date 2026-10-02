import { env } from "cloudflare:workers";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "./chatgpt-auth";
import { BlackfartApp } from "./ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  const adminEmail = (env as unknown as { BF_ADMIN_EMAIL?: string }).BF_ADMIN_EMAIL;
  const isModerator = Boolean(user && adminEmail && user.email.toLowerCase() === adminEmail.toLowerCase());

  return <BlackfartApp
    isSignedIn={Boolean(user)}
    displayName={user?.fullName || user?.displayName || null}
    isModerator={isModerator}
    signInHref={chatGPTSignInPath("/")}
    signOutHref={chatGPTSignOutPath("/")}
  />;
}
