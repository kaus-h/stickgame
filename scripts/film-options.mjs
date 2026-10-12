const usage =
  'usage: npm run film -- <level-id> [--from <chamber-or-tick>] [--ticks N] [--every K] [--scale 0.5]';

export function parseFilmArgs(argv) {
  const id = argv[0];
  if (!id || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) throw new Error(usage);
  const options = { id, from: '0', every: 4, scale: 0.5 };
  for (let i = 1; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!['--from', '--ticks', '--every', '--scale'].includes(flag))
      throw new Error(`unknown option ${flag}; ${usage}`);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${flag}`);
    const key = flag.slice(2);
    options[key] = key === 'from' ? value : Number(value);
  }
  for (const key of ['every', 'ticks']) {
    const value = options[key];
    if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0))
      throw new Error(`--${key} must be a positive integer`);
  }
  if (!Number.isFinite(options.scale) || options.scale <= 0 || options.scale > 1)
    throw new Error('--scale must be greater than 0 and at most 1');
  return options;
}

export function filmRange(options, solution) {
  const start = /^\d+$/.test(options.from)
    ? Number(options.from)
    : solution.chambers.find((chamber) => chamber.id === options.from)?.startTick;
  if (!Number.isSafeInteger(start) || start < 0 || start >= solution.totalTicks)
    throw new Error(`unknown chamber or tick outside route: ${options.from}`);
  return {
    start,
    end: Math.min(solution.totalTicks, start + (options.ticks ?? solution.totalTicks)),
  };
}
