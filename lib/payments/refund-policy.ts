const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

export type RefundDecisionReason =
  | "refund_disabled"
  | "cutoff_met"
  | "cutoff_not_met";

export type RefundDecision = {
  corresponde: boolean;
  motivo: RefundDecisionReason;
  hoursUntilStart: number;
};

export type RefundPolicyInput = {
  refundEnabled: boolean;
  refundCutoffHours: number;
  bookingDate: string;
  bookingStartTime: string;
  timezone?: string | null;
  cancelledAt?: Date;
};

function parseOffsetMinutes(timeZoneName: string) {
  if (timeZoneName === "GMT" || timeZoneName === "UTC") return 0;
  const match = timeZoneName.match(/(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  return sign * (hours * 60 + minutes);
}

function offsetMinutesAt(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  }).formatToParts(date);
  const timeZoneName = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  return parseOffsetMinutes(timeZoneName);
}

export function zonedDateTimeToUtc(date: string, time: string, timeZone: string = DEFAULT_TIMEZONE) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let utcMs = localAsUtc;

  for (let i = 0; i < 3; i++) {
    const offset = offsetMinutesAt(new Date(utcMs), timeZone);
    utcMs = localAsUtc - offset * 60_000;
  }

  return new Date(utcMs);
}

export function decideBookingRefund(input: RefundPolicyInput): RefundDecision {
  const cancelledAt = input.cancelledAt ?? new Date();
  const cutoffHours = Math.max(1, Math.trunc(input.refundCutoffHours));
  const bookingStartsAt = zonedDateTimeToUtc(
    input.bookingDate,
    input.bookingStartTime,
    input.timezone ?? DEFAULT_TIMEZONE,
  );
  const hoursUntilStart = (bookingStartsAt.getTime() - cancelledAt.getTime()) / 3_600_000;

  if (!input.refundEnabled) {
    return { corresponde: false, motivo: "refund_disabled", hoursUntilStart };
  }

  if (hoursUntilStart >= cutoffHours) {
    return { corresponde: true, motivo: "cutoff_met", hoursUntilStart };
  }

  return { corresponde: false, motivo: "cutoff_not_met", hoursUntilStart };
}
