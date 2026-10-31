export function apiErrorMessage(body) {
  const messages = (value) => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(messages);
    if (value && typeof value === 'object') return Object.values(value).flatMap(messages);
    return [];
  };
  const details = [...new Set(messages(body.details))];
  return details.length ? details.join(' ') : body.error || 'The request could not be completed. Please try again.';
}
