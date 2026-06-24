import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getUserByAuthId,
  createAgendaBlocks,
  deleteAgendaBlock,
  deleteAgendaBlockGroup,
} from "@/lib/db/queries";

async function requireClub() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId) return { error: NextResponse.json({ error: "Sin club asignado" }, { status: 403 }) };
  return { clubId: profile.clubId };
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const createSchema = z.object({
  type: z.enum(["clase", "fijo", "evento", "bloqueo"]),
  courtIds: z.array(z.string().uuid()).min(1),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().trim().max(200).nullable().optional(),
  repeatMonth: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const { clubId, error } = await requireClub();
  if (error) return error;

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", detail: parsed.error.flatten() }, { status: 400 });
  }
  const { type, courtIds, dates, startTime, endTime, notes, repeatMonth } = parsed.data;

  if (endTime <= startTime) {
    return NextResponse.json({ error: "La hora de fin debe ser mayor a la de inicio." }, { status: 400 });
  }

  // Expandir fechas: si "repetir el resto del mes", agregamos la misma fecha +7,+14…
  // mientras siga dentro del mismo mes calendario.
  const allDates = new Set<string>();
  for (const base of dates) {
    allDates.add(base);
    if (repeatMonth) {
      const month = base.slice(0, 7);
      let next = addDays(base, 7);
      while (next.slice(0, 7) === month) {
        allDates.add(next);
        next = addDays(next, 7);
      }
    }
  }

  const result = await createAgendaBlocks({
    clubId: clubId!,
    type,
    courtIds,
    dates: [...allDates].sort(),
    startTime,
    endTime,
    notes: notes ?? null,
  });

  return NextResponse.json({ ok: true, ...result });
}

const deleteSchema = z.object({
  bookingId: z.string().uuid().optional(),
  blockGroupId: z.string().uuid().optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine((d) => d.bookingId || d.blockGroupId, { message: "Falta bookingId o blockGroupId" });

export async function DELETE(request: NextRequest) {
  const { clubId, error } = await requireClub();
  if (error) return error;

  const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  if (parsed.data.blockGroupId) {
    await deleteAgendaBlockGroup(clubId!, parsed.data.blockGroupId, parsed.data.fromDate);
  } else if (parsed.data.bookingId) {
    await deleteAgendaBlock(clubId!, parsed.data.bookingId);
  }
  return NextResponse.json({ ok: true });
}
