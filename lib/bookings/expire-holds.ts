import { and, eq, isNotNull, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings } from "@/lib/db/schema";

export type ExpirableBotHold = {
  origin: "admin" | "bot";
  status: "confirmado" | "pendiente" | "cancelado";
  heldUntil: Date | null;
};

export type ExpireBotHoldsResult = {
  released: number;
  bookingIds: string[];
};

type ExpireBotHoldsDb = {
  update: (table: typeof bookings) => {
    set: (values: { status: "cancelado" }) => {
      where: (condition: unknown) => {
        returning: (fields: { id: typeof bookings.id }) => Promise<Array<{ id: string }>>;
      };
    };
  };
};

export function isExpiredBotHold(booking: ExpirableBotHold, now: Date) {
  return (
    booking.origin === "bot" &&
    booking.status === "pendiente" &&
    booking.heldUntil != null &&
    booking.heldUntil.getTime() < now.getTime()
  );
}

export async function expireBotHolds(input: {
  now?: Date;
  db?: ExpireBotHoldsDb;
} = {}): Promise<ExpireBotHoldsResult> {
  const now = input.now ?? new Date();
  const db = input.db ?? (getDb() as unknown as ExpireBotHoldsDb);

  const released = await db
    .update(bookings)
    .set({ status: "cancelado" })
    .where(and(
      eq(bookings.origin, "bot"),
      eq(bookings.status, "pendiente"),
      isNotNull(bookings.heldUntil),
      lt(bookings.heldUntil, now),
    ))
    .returning({ id: bookings.id });

  return {
    released: released.length,
    bookingIds: released.map((booking) => booking.id),
  };
}
