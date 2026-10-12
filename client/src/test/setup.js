// jsdom lacks these; Recharts' ResponsiveContainer needs ResizeObserver.
globalThis.ResizeObserver ||= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
