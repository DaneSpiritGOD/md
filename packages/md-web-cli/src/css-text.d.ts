/** Declares raw-text CSS imports (`*.css?raw`), matching Vite's `?raw` suffix. */
declare module '*.css?raw' {
  const content: string
  export default content
}
