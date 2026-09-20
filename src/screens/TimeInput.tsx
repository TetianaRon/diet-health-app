import { uk } from "../i18n/uk";
import type { TimeFormat } from "../lib/settings";

// The browser's own <input type="time"> / "datetime-local" picks 12h or 24h
// from the device locale and can't be forced either way, so these render
// plain hour/minute selects instead — the app's own 24h/12h setting decides
// what they show. Values are always canonical 24h ("HH:MM", or
// "yyyy-MM-ddTHH:mm" for the date-time one), whatever is displayed.

const pad = (n: number) => String(n).padStart(2, "0");
const range = (count: number) => Array.from({ length: count }, (_, i) => i);

export function TimeInput({
  value,
  onChange,
  format,
  ariaLabel,
}: {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  format: TimeFormat;
  ariaLabel: string;
}) {
  const [h, m] = value.split(":").map(Number);
  const hour24 = Number.isFinite(h) ? h : 0;
  const minute = Number.isFinite(m) ? m : 0;
  const isPm = hour24 >= 12;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  const emit = (nextHour24: number, nextMinute: number) => onChange(`${pad(nextHour24)}:${pad(nextMinute)}`);
  const from12 = (hour: number, pm: boolean) => (hour % 12) + (pm ? 12 : 0);

  return (
    <div className="time-input" role="group" aria-label={ariaLabel}>
      {format === "24h" ? (
        <select aria-label={uk.timeInput.hour} value={hour24} onChange={(e) => emit(Number(e.target.value), minute)}>
          {range(24).map((hr) => (
            <option key={hr} value={hr}>
              {pad(hr)}
            </option>
          ))}
        </select>
      ) : (
        <select
          aria-label={uk.timeInput.hour}
          value={hour12}
          onChange={(e) => emit(from12(Number(e.target.value), isPm), minute)}
        >
          {[12, ...range(11).map((i) => i + 1)].map((hr) => (
            <option key={hr} value={hr}>
              {hr}
            </option>
          ))}
        </select>
      )}
      <span aria-hidden="true">:</span>
      <select aria-label={uk.timeInput.minute} value={minute} onChange={(e) => emit(hour24, Number(e.target.value))}>
        {range(60).map((min) => (
          <option key={min} value={min}>
            {pad(min)}
          </option>
        ))}
      </select>
      {format === "12h" && (
        <select
          aria-label={uk.timeInput.period}
          value={isPm ? "pm" : "am"}
          onChange={(e) => emit(from12(hour12, e.target.value === "pm"), minute)}
        >
          <option value="am">AM</option>
          <option value="pm">PM</option>
        </select>
      )}
    </div>
  );
}

// A date plus a TimeInput, behind the same "yyyy-MM-ddTHH:mm" string the
// datetime-local input used — so callers (and toDatetimeLocalValue /
// fromDatetimeLocalValue) are unchanged.
export function DateTimeInput({
  value,
  onChange,
  format,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  format: TimeFormat;
  ariaLabel: string;
}) {
  const [date = "", time = "00:00"] = value.split("T");
  return (
    <div className="datetime-input" role="group" aria-label={ariaLabel}>
      <input type="date" aria-label={uk.timeInput.date} value={date} onChange={(e) => onChange(`${e.target.value}T${time}`)} />
      <TimeInput
        value={time || "00:00"}
        format={format}
        ariaLabel={ariaLabel}
        onChange={(t) => onChange(`${date}T${t}`)}
      />
    </div>
  );
}
