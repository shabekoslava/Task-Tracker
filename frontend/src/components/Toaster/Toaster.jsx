import { useEffect, useState } from "react";
import { subscribe } from "../../lib/toast";
import Icon from "../Icon/Icon";

const LIFETIME_MS = 3600;

export default function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(
    () =>
      subscribe((item) => {
        setItems((prev) => [...prev.slice(-3), item]);
        setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== item.id)), LIFETIME_MS);
      }),
    [],
  );

  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`toast toast-${item.type}`}>
          <Icon name={item.type === "error" ? "close" : "check"} size={16} strokeWidth={2.25} />
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}
