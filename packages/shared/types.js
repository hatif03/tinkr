/** @typedef {{ selector?: string, tag?: string, stable?: [string,string][], text?: string, scrollX?: number, scrollY?: number, x?: number, y?: number, zIndex?: number }} TargetAnchor */

/** @typedef {{ type: string, selector?: string, styles?: Record<string,string>, text?: string, breakpoint?: string, target?: object, html?: string, parent?: string, after?: string }} Patch */

/** @typedef {{ patches: Patch[], labs?: object[], tokens?: Record<string,string>, sections?: Section[], prototypeLinks?: PrototypeLink[], motion?: MotionKeyframe[], canvasMeta?: CanvasMeta }} ProjectDraft */

/** @typedef {{ id: string, label: string, scrollY: number, height: number, status?: string }} Section */

/** @typedef {{ id: string, selector: string, targetScrollY?: number, targetUrl?: string, label?: string }} PrototypeLink */

/** @typedef {{ property: string, from: string, to: string, duration: string, delay?: string }} MotionKeyframe */

/** @typedef {{ scrollAnchors?: object[], sections?: Section[], viewportState?: { scale: number, x: number, y: number } }} CanvasMeta */

export {};
