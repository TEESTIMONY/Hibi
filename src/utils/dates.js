const TIME_ZONE = 'Africa/Lagos';

export function getPlannerDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(now);
  const value = (type) => Number(parts.find((part) => part.type === type).value);
  return new Date(Date.UTC(value('year'), value('month') - 1, value('day')));
}

export function formatDate(options, now = new Date()) {
  return new Intl.DateTimeFormat('en', { ...options, timeZone: TIME_ZONE }).format(now);
}

export function getWeek(now = new Date()) {
  const today = getPlannerDate(now);
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    return {
      label: new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(date),
      day: date.getUTCDate(),
      current: date.getTime() === today.getTime(),
      past: date < today,
    };
  });
}
