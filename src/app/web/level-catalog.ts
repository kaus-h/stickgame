/** Vite owns file discovery; content remains independent of the browser and bundler. */
export const levelSources = import.meta.glob('../../../content/levels/*.json', {
  eager: true,
  import: 'default',
});
