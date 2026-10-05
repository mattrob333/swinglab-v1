// Small inline icons for player controls.

export function Icon({ d, className = "h-6 w-6", fill = false }: { d: string; className?: string; fill?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

export const ICONS = {
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
  unlink: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1M4 4l16 16",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  flip: "M12 3v18M8 7L3 12l5 5V7zM16 7l5 5-5 5V7z",
  stacked: "M4 4h16v7H4zM4 13h16v7H4z",
  side: "M4 4h7v16H4zM13 4h7v16h-7z",
  chevronDown: "M6 9l6 6 6-6",
  chevronUp: "M6 15l6-6 6 6",
  close: "M6 6l12 12M18 6L6 18",
  share: "M12 3v12M8 7l4-4 4 4M5 12v7h14v-7",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  compare: "M4 4h16v7H4zM4 13h16v7H4z",
};
