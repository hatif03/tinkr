import type { SVGProps } from "react";

export type IconName = "sparkle" | "clock" | "star" | "folder" | "library" | "search" | "plus" | "more" | "external" | "edit" | "play" | "chevron" | "logOut" | "arrowLeft" | "layers" | "code" | "share" | "check" | "cloud" | "hand" | "move" | "frame" | "square" | "pen" | "type" | "comment" | "command";

const paths: Record<IconName, React.ReactNode> = {
  sparkle: <><path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></>,
  clock: <><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>, star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,
  folder: <path d="M3.5 6.5h6l1.7 2H20.5v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2Z"/>, library: <><path d="M4 4.5h13.5v15H4z"/><path d="M8 4.5v15M12 8h3"/></>,
  search: <><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/></>, plus: <path d="M12 5v14M5 12h14"/>, more: <path d="M5 12h.01M12 12h.01M19 12h.01"/>, external: <><path d="M14 5h5v5"/><path d="m19 5-8 8"/><path d="M19 14v5H5V5h5"/></>,
  edit: <><path d="m4 16.5-.5 4 4-.5L19 8.5 15.5 5 4 16.5Z"/><path d="m13.5 7 3.5 3.5"/></>, play: <path d="m9 6 9 6-9 6V6Z"/>, chevron: <path d="m8 10 4 4 4-4"/>, logOut: <><path d="M10 5H5v14h5"/><path d="m14 8 4 4-4 4M8 12h10"/></>,
  arrowLeft: <path d="m14 6-6 6 6 6M8 12h11"/>, layers: <><path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4"/></>, code: <><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 4l-4 16"/></>, share: <><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/></>, check: <path d="m5 12 4 4L19 6"/>, cloud: <path d="M7 18a4 4 0 1 1 .8-7.9A5.5 5.5 0 0 1 18.5 12 3.2 3.2 0 1 1 18 18H7Z"/>,
  hand: <path d="M8 11V5a1.5 1.5 0 0 1 3 0v5V3.5a1.5 1.5 0 0 1 3 0V10V5a1.5 1.5 0 0 1 3 0v6l1-1a1.6 1.6 0 0 1 2.3 2.3l-3.7 4A5 5 0 0 1 13 18H11a5 5 0 0 1-5-5v-2a1.5 1.5 0 0 1 2 0Z"/>, move: <><path d="m12 3 2 2-1 1h3v3l1-1 2 2-2 2-1-1v3h-3l1 1-2 2-2-2 1-1H8v-3l-1 1-2-2 2-2 1 1V6h3l-1-1 2-2Z"/></>,
  frame: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>, square: <rect x="5" y="5" width="14" height="14" rx="1"/>, pen: <><path d="m4 20 4-.8L19 8l-3-3L5 16l-1 4Z"/><path d="m14.5 6.5 3 3"/></>, type: <><path d="M5 5h14M12 5v14M8 19h8"/></>, comment: <path d="M5 5h14v10H9l-4 4V5Z"/>, command: <><path d="M9 7V5a2 2 0 1 0-4 0v2a2 2 0 1 0 0 4h2v2H5a2 2 0 1 0 0 4h2a2 2 0 1 0 4 0v-2h2v2a2 2 0 1 0 4 0v-2a2 2 0 1 0 0-4h-2V9h2a2 2 0 1 0 0-4h-2a2 2 0 1 0-4 0v2H9Z"/></>
};

export function Icon({ name, size = 16, ...props }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
