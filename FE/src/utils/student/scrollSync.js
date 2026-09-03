export function mapScrollPosition(value, sourceMax, targetMax, anchors = []) {
  if (!(sourceMax > 0) || !(targetMax > 0)) return 0;

  const points = [[0, 0]];
  const ordered = anchors
    .filter(([source, target]) => Number.isFinite(source) && Number.isFinite(target)
      && source > 0 && source < sourceMax && target > 0 && target < targetMax)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  for (const [source, target] of ordered) {
    const previous = points[points.length - 1];
    if (source === previous[0]) previous[1] = Math.max(previous[1], target);
    else if (target > previous[1]) points.push([source, target]);
  }
  points.push([sourceMax, targetMax]);
  const position = Math.max(0, Math.min(value, sourceMax));
  let [fromSource, fromTarget] = points[0];

  for (let i = 1; i < points.length; i += 1) {
    const [toSource, toTarget] = points[i];
    if (position <= toSource) {
      return fromTarget + ((position - fromSource) / (toSource - fromSource)) * (toTarget - fromTarget);
    }
    fromSource = toSource;
    fromTarget = toTarget;
  }

  return targetMax;
}
