import { getAllClubs } from "@/lib/db/queries";
import { ClubsClient } from "@/components/superadmin/clubs-client";

export const metadata = { title: "Clubs · Super Admin" };

export default async function ClubsPage() {
  const clubs = await getAllClubs();
  return <ClubsClient clubs={clubs} />;
}
