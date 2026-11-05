import { useEffect } from "react";
import Icon from "../Icon/Icon";

export default function Modal({ title, onClose, children, footer, width = 480, className = "" }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className={`modal ${className}`}
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className="modal-head">
            {typeof title === "string" ? <h3>{title}</h3> : title}
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Закрыть">
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
