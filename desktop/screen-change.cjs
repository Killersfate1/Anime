'use strict';

// Fast, local change detector for small, 4-channel BGRA thumbnails.
// Stores only a temporary 96x54 bitmap in RAM; no screenshots on disk.
function compareFrames(previous, current) {
  if (!current || current.length < 4 || current.length % 4)
    return { changed: false, averageDelta: 0, changedFraction: 0 };
  if (!previous || previous.length !== current.length)
    return { changed: true, averageDelta: 255, changedFraction: 1 };
  let sum = 0;
  let changed = 0;
  let sampled = 0;
  for (let i = 0; i < current.length; i += 16) {
    let pixDiff = 0;
    for (let c = 0; c < 3; c++)
      pixDiff += Math.abs(current[i + c] - previous[i + c]);
    const mean = pixDiff / 3;
    sum += mean;
    if (mean >= 26) changed++;
    sampled++;
  }
  const averageDelta = sum / sampled;
  const changedFraction = changed / sampled;
  return {
    changed: averageDelta >= 5 || changedFraction >= 0.025,
    averageDelta,
    changedFraction
  };
}
module.exports = { compareFrames };
