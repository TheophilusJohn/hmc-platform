import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

const IST = 'Asia/Kolkata';

export function toIST(date) {
  return dayjs(date).tz(IST);
}

export function toLocalTZ(date, tz = IST) {
  return dayjs(date).tz(tz);
}

export function formatDate(date, fmt = 'D MMM YYYY') {
  return date ? dayjs(date).format(fmt) : '—';
}

export function formatDateTime(date, fmt = 'D MMM YYYY, h:mm A') {
  return date ? dayjs(date).tz(IST).format(fmt) : '—';
}

export function formatDateTimeWithTZ(date, tz = IST) {
  const local = dayjs(date).tz(tz).format('D MMM YYYY, h:mm A z');
  if (tz !== IST) {
    const ist = dayjs(date).tz(IST).format('h:mm A IST');
    return `${local} (${ist})`;
  }
  return local;
}

export function fromNow(date) {
  return dayjs(date).fromNow();
}

export function daysUntil(date) {
  return dayjs(date).diff(dayjs(), 'day');
}

export function isOverdue(date) {
  return dayjs(date).isBefore(dayjs());
}

export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
