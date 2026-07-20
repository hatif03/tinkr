/** @typedef {{ selector?: string, tag?: string, stable?: [string,string][], text?: string, scrollX?: number, scrollY?: number, x?: number, y?: number, zIndex?: number }} TargetAnchor */

/** @typedef {{ type: string, selector?: string, styles?: Record<string,string>, text?: string, breakpoint?: string, target?: object, html?: string, parent?: string, after?: string, vector?: object }} Patch */

/** @typedef {{ id: string, type: string, d?: string, x: number, y: number, w?: number, h?: number, fill?: string, stroke?: string, points?: number[][], nodes?: object[], anchor?: TargetAnchor }} VectorLayer */

/** @typedef {{ id: string, x: number, y: number, w: number, h: number, scrollY?: number }} Slice */

/** @typedef {{ text: object[], colors: object[], effects: object[] }} StyleLibrary */

/** @typedef {{ patches: Patch[], labs?: object[], tokens?: Record<string,string>, sections?: Section[], slices?: Slice[], prototypeLinks?: PrototypeLink[], motion?: MotionKeyframe[], vectorLayers?: VectorLayer[], styles?: StyleLibrary, components?: object[], canvasMeta?: CanvasMeta }} ProjectDraft */

/** @typedef {{ id: string, label: string, scrollY: number, height: number, status?: string }} Section */

/** @typedef {{ id: string, selector: string, targetScrollY?: number, targetUrl?: string, label?: string }} PrototypeLink */

/** @typedef {{ id?: string, selector?: string, targetId?: string, property: string, from: string, to: string, duration: string, delay?: string, easing?: string }} MotionKeyframe */

/** @typedef {{ scrollAnchors?: object[], sections?: Section[], viewportState?: { scale: number, x: number, y: number } }} CanvasMeta */

/** @typedef {{ selector: string, tag: string, box: object, css: object, cssText: string, tokens: object, tailwind: string, a11y: object, diff: object, reactSnippet?: string }} DevSpec */

export {};
