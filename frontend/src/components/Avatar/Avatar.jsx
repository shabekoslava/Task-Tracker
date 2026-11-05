import { initials } from "../../lib/format";

// Цвет фона выбирается по имени, чтобы у одного человека он был одинаковым везде
const PALETTE = ["#e8643c", "#4f8cf0", "#36b37e", "#a26cf0", "#e6a23c", "#d9547a", "#2fb5b0"];

function colorFor(seed) {
  let hash = 0;
  for (const ch of String(seed || "")) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export default function Avatar({ name, src, size = 28, className = "" }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (src) {
    return <img className={`avatar ${className}`} src={src} alt={name} title={name} style={style} />;
  }
  return (
    <span
      className={`avatar ${className}`}
      title={name}
      style={{ ...style, background: colorFor(name) }}
    >
      {initials(name)}
    </span>
  );
}
