import icon from "../../../assets/icon.png";

/** The approved app icon is shared by the executable, tray and attached surfaces. */
export function PulseBrandMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return <img src={icon} width={size} height={size} className={`pulse-brand-image ${className}`} alt="" aria-hidden="true" draggable={false} style={{ width: size, height: size, flexShrink: 0, objectFit: "contain" }} />;
}
