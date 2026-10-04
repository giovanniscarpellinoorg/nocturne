// Generation repair only. Existing sprites still pass through strict validation.
// Keep actual source colors, favor frequent shades and preserve contrasting details.
export function reducePalette(pixels, limit = 16) {
  const counts = new Map();
  for (const {rgba} of pixels) counts.set(rgba, (counts.get(rgba) ?? 0) + 1);
  const vector = color => {
    const channels = color.slice(1).match(/../g).map(n => parseInt(n, 16));
    const alpha = channels[3] / 255;
    return [channels[0] * alpha, channels[1] * alpha, channels[2] * alpha, channels[3]];
  };
  const distance = (a, b) => (a[0]-b[0])**2 * .3 + (a[1]-b[1])**2 * .59 + (a[2]-b[2])**2 * .11 + (a[3]-b[3])**2;
  const colors = [...counts].map(([color, count]) => ({color, count, vector: vector(color)}));
  const clear = colors.find(c => c.color.endsWith('00'));
  const visible = colors.filter(c => !c.color.endsWith('00')).sort((a,b) => b.count-a.count || a.color.localeCompare(b.color));
  const chosen = [visible[0]], budget = limit - Number(Boolean(clear));
  const nearest = visible.map(c => distance(c.vector, chosen[0].vector));
  while (chosen.length < Math.min(budget, visible.length)) {
    let best = -1, score = -1;
    visible.forEach((c,i) => {const candidate = nearest[i] * Math.sqrt(c.count); if (candidate > score) {best=i;score=candidate;}});
    if (score <= 0) break;
    chosen.push(visible[best]);
    visible.forEach((c,i) => {nearest[i] = Math.min(nearest[i], distance(c.vector, visible[best].vector));});
  }
  const replacements = new Map();
  for (const source of colors) {
    const target = source.color.endsWith('00') ? clear : chosen.reduce((best, c) => distance(source.vector,c.vector) < distance(source.vector,best.vector) ? c : best);
    replacements.set(source.color, target.color);
  }
  let changedPixels = 0;
  const result = pixels.map(p => {const rgba = replacements.get(p.rgba);if(rgba !== p.rgba)changedPixels++;return {...p,rgba};});
  return {pixels:result, replacements, diagnostics:{from:counts.size,to:new Set(result.map(p=>p.rgba)).size,changedPixels,mappings:[...replacements].filter(([from,to])=>from!==to).map(([from,to])=>({from,to}))}};
}
