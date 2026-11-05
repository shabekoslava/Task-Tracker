export const ROLE_LABELS = {
  admin: "Админ",
  member: "Участник",
  viewer: "Наблюдатель",
};

export const roleLabel = (role) => ROLE_LABELS[role] || ROLE_LABELS.viewer;

export const DEFAULT_PROJECT_TAGS = ["дизайн", "баг", "срочно", "фича", "фронтенд", "бэкенд"];

// Старые данные хранили приоритет по-разному, все варианты считаем срочными
export const isUrgent = (task) => ["Срочно", "Критичный", "Высокий"].includes(task?.priority);

// "2026-11-15" или ISO-строка → Date в локальной полуночи (без сдвига часового пояса)
export function parseDay(value) {
  if (!value) return null;
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export const toDateInput = (value) => (value ? String(value).slice(0, 10) : "");

export function formatDay(value, withYear = false) {
  const date = parseDay(value);
  if (!date) return "";
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    ...(withYear && { year: "numeric" }),
  });
}

export function formatTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function initials(name) {
  return (
    String(name || "")
      .split(/[\s-]+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

export const pluralize = (n, [one, few, many]) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
