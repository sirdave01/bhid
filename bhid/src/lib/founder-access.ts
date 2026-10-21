import "server-only";

import { cookies } from "next/headers";

import { getAuthenticatedSession } from "@/lib/session";

const founderEmail = "d08178084956@gmail.com";
const founderUserId = "c4c2ecbd-bd82-4290-96b4-8df5cd44dbf1";

export async function getFounderSession() {
  const accessToken = (await cookies()).get("bhid_access")?.value;
  const session = await getAuthenticatedSession(accessToken);

  if (
    !session ||
    session.userId !== founderUserId ||
    session.email.trim().toLowerCase() !== founderEmail
  ) {
    return null;
  }

  return session;
}
