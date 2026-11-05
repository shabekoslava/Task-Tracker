// Минимальная шина уведомлений: toast("текст", "error") из любого места,
// <Toaster /> в корне приложения подписывается и рисует их.
const listeners = new Set();
let nextId = 1;

export function toast(message, type = "success") {
  const item = { id: nextId++, message, type };
  listeners.forEach((listener) => listener(item));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
