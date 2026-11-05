export function formatDDMMYYYY(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

export function datedPayload(message, data = {}, value = new Date()) {
  return {
    date: formatDDMMYYYY(value),
    message,
    ...data,
  };
}
