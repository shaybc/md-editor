/** Validation and next-run calculation for five-field local-time schedule expressions. */

"use strict";

const FIELD_LIMITS = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];

/** Parse a standard five-field expression into matching value sets. */
function parseScheduleExpression(value) {
  const fields = String(value || "").trim().split(/\s+/);
  if (fields.length !== 5) throw scheduleError("SCHEDULE_EXPRESSION_INVALID", "A calendar schedule requires five fields: minute hour day-of-month month day-of-week.");
  return fields.map((field, index) => parseField(field, ...FIELD_LIMITS[index]));
}

/** Find the first matching local minute within one year after the supplied time. */
function nextScheduleTime(value, after = Date.now()) {
  const fields = Array.isArray(value) ? value : parseScheduleExpression(value);
  const candidate = new Date(after);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);
  const maximum = after + 366 * 24 * 60 * 60 * 1000;
  while (candidate.getTime() <= maximum) {
    const dayOfMonth = fields[2].has(candidate.getDate());
    const dayOfWeek = fields[4].has(candidate.getDay());
    const dayMatches = fields[2].wildcard || fields[4].wildcard ? dayOfMonth && dayOfWeek : dayOfMonth || dayOfWeek;
    if (fields[0].has(candidate.getMinutes()) && fields[1].has(candidate.getHours()) && dayMatches && fields[3].has(candidate.getMonth() + 1)) return candidate.getTime();
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  throw scheduleError("SCHEDULE_EXPRESSION_UNREACHABLE", "The calendar schedule has no matching time in the next year.");
}

/** Return a concise stable description suitable for tool and UI results. */
function describeScheduleExpression(expression) { parseScheduleExpression(expression); return `calendar schedule ${String(expression).trim()} in local time`; }

function parseField(source, minimum, maximum) {
  const values = new Set();
  values.wildcard = String(source || "") === "*";
  for (const segment of String(source || "").split(",")) {
    const [rangePart, stepPart] = segment.split("/");
    const step = stepPart == null ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) throw scheduleError("SCHEDULE_EXPRESSION_INVALID", `Invalid schedule step: ${segment}.`);
    let start;
    let end;
    if (rangePart === "*") { start = minimum; end = maximum; }
    else if (rangePart.includes("-")) { [start, end] = rangePart.split("-").map(Number); }
    else { start = Number(rangePart); end = Number(rangePart); }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < minimum || end > maximum || start > end) throw scheduleError("SCHEDULE_EXPRESSION_INVALID", `Invalid schedule field: ${segment}.`);
    for (let value = start; value <= end; value += step) values.add(value);
  }
  return values;
}

function scheduleError(code, message) { const error = new Error(message); error.code = code; error.retryable = false; error.doNotRetry = true; return error; }

module.exports = { describeScheduleExpression, nextScheduleTime, parseScheduleExpression };
