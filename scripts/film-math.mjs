/** Pure tick selection and contact-sheet geometry for the film CLI. */

function integer(value, name, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be a safe integer >= ${minimum}`);
  }
}

function cap(value, name, minimum = 2) {
  if (value !== Infinity) integer(value, name, minimum);
}

/** Choose evenly spaced indices without discarding either endpoint. */
function evenlySpaced(values, limit) {
  if (values.length <= limit) return [...values];
  return Array.from(
    { length: limit },
    (_, index) => values[Math.round((index * (values.length - 1)) / (limit - 1))],
  );
}

/** Include the start, every Kth tick after it, and the final tick; thin evenly if capped. */
export function selectFrameTicks(startTick, endTick, every = 4, maxFrames = Infinity) {
  integer(startTick, 'startTick');
  integer(endTick, 'endTick');
  integer(every, 'every', 1);
  cap(maxFrames, 'maxFrames');
  if (endTick < startTick) throw new RangeError('endTick must be >= startTick');

  const regularCount = Math.floor((endTick - startTick) / every) + 1;
  const hasExtraEndpoint = startTick + (regularCount - 1) * every !== endTick;
  const count = regularCount + Number(hasExtraEndpoint);
  // Compute capped selections directly, avoiding a huge intermediate array for long replays.
  const selectedCount = Math.min(count, maxFrames);
  return Array.from({ length: selectedCount }, (_, index) => {
    const sourceIndex =
      selectedCount === count ? index : Math.round((index * (count - 1)) / (selectedCount - 1));
    return sourceIndex === count - 1 ? endTick : startTick + sourceIndex * every;
  });
}

/** Select up to 16 evenly spaced captured frames, retaining the first and last. */
export function selectSheetFrames(frameTicks, maxFrames = 16) {
  if (!Array.isArray(frameTicks)) throw new TypeError('frameTicks must be an array');
  integer(maxFrames, 'maxFrames', 2);
  for (let index = 0; index < frameTicks.length; index++) {
    integer(frameTicks[index], 'frameTicks entry');
    if (index > 0 && frameTicks[index] <= frameTicks[index - 1]) {
      throw new RangeError('frameTicks must be strictly increasing');
    }
  }
  return evenlySpaced(frameTicks, maxFrames);
}

/** Fit a four-column sheet, with readable 32px tick labels and 12px gutters. */
export function layoutGrid(frameCount, frameWidth, frameHeight, maxWidth = 1600) {
  integer(frameCount, 'frameCount', 1);
  integer(frameWidth, 'frameWidth', 1);
  integer(frameHeight, 'frameHeight', 1);
  integer(maxWidth, 'maxWidth', 1);
  const columns = Math.min(4, frameCount);
  const rows = Math.ceil(frameCount / columns);
  const padding = 16;
  const gap = 12;
  const labelHeight = 32;
  const availableWidth = Math.floor((maxWidth - padding * 2 - gap * (columns - 1)) / columns);
  if (availableWidth < 1) throw new RangeError('maxWidth is too small for the grid');
  const width = Math.min(frameWidth, availableWidth);
  const height = Math.max(1, Math.round((frameHeight * width) / frameWidth));
  const cellHeight = height + labelHeight;

  return {
    columns,
    rows,
    frameWidth: width,
    frameHeight: height,
    labelHeight,
    gap,
    padding,
    width: padding * 2 + columns * width + (columns - 1) * gap,
    height: padding * 2 + rows * cellHeight + (rows - 1) * gap,
    cells: Array.from({ length: frameCount }, (_, index) => ({
      x: padding + (index % columns) * (width + gap),
      y: padding + Math.floor(index / columns) * (cellHeight + gap),
      labelY: padding + Math.floor(index / columns) * (cellHeight + gap) + height,
    })),
  };
}
