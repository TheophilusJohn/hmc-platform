// server/src/utils/dateUtils.js
// IST-anchored date helpers. The process TZ may differ from IST (containers
// often run UTC), so don't rely on `new Date(...)` constructors that read
// local time. These helpers always express the IST calendar regardless.

const IST_TZ = 'Asia/Kolkata';

// Midnight of `Y-M-D` in IST, expressed as a UTC Date.
// IST is UTC+5:30, so IST midnight == 18:30 UTC of the previous calendar day.
function istBusinessDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day, -5, -30, 0));
}

// The current IST calendar day, regardless of process TZ.
function nowInIST() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((a, p) => (a[p.type] = p.value, a), {});
  return { year: Number(parts.year), monthIndex: Number(parts.month) - 1, day: Number(parts.day) };
}

// 23:59:59.999 IST of the given Date or "today in IST".
function istEndOfDay(date) {
  const ist = date ? istCalendarOf(date) : nowInIST();
  // 24:00 IST of the same day == 00:00 IST of the next day == 18:30 UTC of "the day".
  // Subtract 1ms so the result still falls within `date`'s IST day.
  return new Date(istBusinessDate(ist.year, ist.monthIndex, ist.day + 1).getTime() - 1);
}

// IST calendar (Y/M/D) of an arbitrary Date.
function istCalendarOf(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).reduce((a, p) => (a[p.type] = p.value, a), {});
  return { year: Number(parts.year), monthIndex: Number(parts.month) - 1, day: Number(parts.day) };
}

// Add N IST calendar days to `from` and return IST-end-of-day of the result.
function istEndOfDayPlusDays(from, days) {
  const ist = istCalendarOf(from || new Date());
  return new Date(istBusinessDate(ist.year, ist.monthIndex, ist.day + days + 1).getTime() - 1);
}

// Format a Date in IST `en-IN` short date, with timeZone explicitly set so the
// output is stable regardless of container locale/TZ.
function formatISTDate(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { timeZone: IST_TZ, day: '2-digit', month: 'short', year: 'numeric' });
}

module.exports = {
  IST_TZ,
  istBusinessDate,
  nowInIST,
  istEndOfDay,
  istCalendarOf,
  istEndOfDayPlusDays,
  formatISTDate,
};
