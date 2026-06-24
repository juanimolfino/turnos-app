import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserByAuthId } from "@/lib/db/queries";
import { getDb } from "@/lib/db";
import { recurringRules, events, professors, customers, courts, clubs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AjustesClient } from "@/components/dashboard/ajustes-client";

export const metadata = { title: "Ajustes" };

export default async function AjustesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId) redirect("/login");

  const db = getDb();
  const clubId = profile.clubId;

  const [allRules, allEvents, allProfessors, allCustomers, allCourts, clubRow] = await Promise.all([
    db.select().from(recurringRules).where(and(eq(recurringRules.clubId, clubId), eq(recurringRules.active, true))),
    db.select().from(events).where(eq(events.clubId, clubId)),
    db.select().from(professors).where(and(eq(professors.clubId, clubId), eq(professors.active, true))),
    db.select().from(customers).where(eq(customers.clubId, clubId)),
    db.select().from(courts).where(and(eq(courts.clubId, clubId), eq(courts.active, true))),
    db.select().from(clubs).where(eq(clubs.id, clubId)),
  ]);

  const professorMap = Object.fromEntries(allProfessors.map(p => [p.id, p.name]));
  const customerMap = Object.fromEntries(allCustomers.map(c => [c.id, c.name]));
  const courtMap = Object.fromEntries(allCourts.map(c => [c.id, c.name]));

  const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

  const clases = allRules.filter(r => r.type === "clase").map(r => ({
    id: r.id,
    prof: r.professorId ? professorMap[r.professorId] ?? "Profesor" : "Profesor",
    day: WEEKDAYS[r.weekday] ?? `Día ${r.weekday}`,
    time: `${r.startTime} – ${r.endTime}`,
    court: r.courtId ? courtMap[r.courtId] ?? "Cancha" : "Varias",
  }));

  const fijos = allRules.filter(r => r.type === "fijo").map(r => ({
    id: r.id,
    who: r.customerId ? customerMap[r.customerId] ?? (r.notes ?? "Cliente") : (r.notes ?? "Cliente"),
    day: (WEEKDAYS[r.weekday] ?? `Día ${r.weekday}`).toLowerCase(),
    time: `${r.startTime} – ${r.endTime}`,
    court: r.courtId ? courtMap[r.courtId] ?? "Cancha" : "Varias",
  }));

  const eventList = allEvents.map(e => ({
    id: e.id,
    name: e.name,
    date: e.date,
    time: `${e.startTime} – ${e.endTime}`,
    courts: `${e.courtIds.length} cancha${e.courtIds.length !== 1 ? "s" : ""}`,
    cupos: `${e.registeredCount}/${e.capacity}`,
    state: e.status === "inscripcion_abierta" ? "Inscripción abierta" :
           e.status === "programado" ? "Programado" :
           e.status === "finalizado" ? "Finalizado" : "Cancelado",
  }));

  const club = clubRow[0];

  return <AjustesClient clases={clases} fijos={fijos} eventos={eventList} club={{
    address: club?.address,
    city: club?.city,
    neighborhood: club?.neighborhood,
    phone: club?.phone,
    requiresPayment: club?.requiresPayment,
    paymentDeadlineHours: club?.paymentDeadlineHours,
    mercadopagoAccessToken: club?.mercadopagoAccessToken,
    apiKey: club?.apiKey,
  }} />;
}
