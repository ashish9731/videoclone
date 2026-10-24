import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom (this version) ships no DOMRect global at all, yet Radix's context-menu virtual trigger
// reads the bare `DOMRect` to report the pointer position, so opening a menu throws. Provide the
// small rect contract floating-ui consumes (x/y/width/height + the four edges) plus DOMRect.fromRect.
if (typeof globalThis.DOMRect === "undefined") {
  class Rect {
    x: number;
    y: number;
    width: number;
    height: number;
    constructor(x = 0, y = 0, width = 0, height = 0) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    }
    get top() {
      return this.y;
    }
    get right() {
      return this.x + this.width;
    }
    get bottom() {
      return this.y + this.height;
    }
    get left() {
      return this.x;
    }
    toJSON() {
      return { x: this.x, y: this.y, width: this.width, height: this.height };
    }
    static fromRect(dict: DOMRectInit = {}) {
      return new Rect(dict.x ?? 0, dict.y ?? 0, dict.width ?? 0, dict.height ?? 0);
    }
  }
  Object.defineProperty(globalThis, "DOMRect", { writable: true, configurable: true, value: Rect });
}
