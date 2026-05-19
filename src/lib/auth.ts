import { cookies } from "next/headers";

export type Role = "admin" | "crew" | null;

export interface Session {
  role: Role;
  eventId: string | null;
}

export function getRole(): Role {
  const c = cookies().get("emboss_role")?.value;
  if (c === "admin" || c === "crew") return c;
  return null;
}

export function getSession(): Session {
  return {
    role: getRole(),
    eventId: cookies().get("emboss_event_id")?.value || null,
  };
}
