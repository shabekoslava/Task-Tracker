const TOKEN_KEY = "auth_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Обёртка над fetch: JSON, токен из localStorage и понятный текст ошибки
// (бэкенд кладёт его в поле detail).
export async function api(path, { method = "GET", body, headers } = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined && { "Content-Type": "application/json" }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Сервер недоступен. Проверьте подключение.", 0);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.detail || `Ошибка сервера (${res.status})`, res.status);
  }
  return data;
}
