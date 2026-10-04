export const reviewStatuses = {draft: 'À revoir', approved: 'Validé', rejected: 'Écarté'};
export const emptyReview = () => ({rating: 0, status: 'draft', likes: '', dislikes: '', tags: []});
export function validateReview(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !Object.keys(emptyReview()).includes(k))) throw Error('Avis invalide');
  if (!Number.isInteger(input.rating) || input.rating < 0 || input.rating > 5) throw Error('Note attendue entre 0 et 5');
  if (!Object.hasOwn(reviewStatuses, input.status)) throw Error('Statut inconnu');
  for (const key of ['likes', 'dislikes']) if (typeof input[key] !== 'string' || input[key].length > 800 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input[key])) throw Error('Commentaire limité à 800 caractères');
  if (!Array.isArray(input.tags) || input.tags.length > 8 || input.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.trim().length > 24 || /\p{Cc}/u.test(tag))) throw Error('Maximum 8 tags de 24 caractères');
  return {rating: input.rating, status: input.status, likes: input.likes.trim(), dislikes: input.dislikes.trim(), tags: [...new Set(input.tags.map(t => t.trim().toLowerCase()))]};
}
const folded = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export function filterSprites(records, filters = {}) {
  const query = folded(filters.query || '');
  const result = records.filter(record => {
    const r = record.review ?? emptyReview();
    return (!filters.type || filters.type === 'all' || record.gameplay?.type === filters.type)
      && (!filters.status || filters.status === 'all' || r.status === filters.status)
      && (!filters.rating || r.rating >= Number(filters.rating))
      && (!filters.size || filters.size === 'all' || record.sprite.width === Number(filters.size))
      && (!filters.model || filters.model === 'all' || record.model === filters.model)
      && (!filters.family || filters.family === 'all' || (record.rootId ?? record.id) === filters.family)
      && (!query || folded([record.sprite.name, record.sprite.description, r.likes, r.dislikes, ...r.tags].join(' ')).includes(query));
  });
  return result.sort((a, b) => filters.sort === 'rating' ? (b.review?.rating ?? 0) - (a.review?.rating ?? 0) || b.createdAt.localeCompare(a.createdAt) : filters.sort === 'name' ? a.sprite.name.localeCompare(b.sprite.name, 'fr') : b.createdAt.localeCompare(a.createdAt));
}
export function feedbackContext(records, type, reference) {
  const relevant = records.filter(r => r.gameplay.type === type && (r.review.rating || r.review.likes || r.review.dislikes || r.review.status !== 'draft'));
  const best = relevant.filter(r => r.review.status !== 'rejected' && (r.review.rating >= 4 || r.review.status === 'approved')).sort((a,b) => b.review.rating - a.review.rating).slice(0,3);
  const issues = relevant.filter(r => r.review.dislikes || r.review.status === 'rejected').slice(0,3);
  const selected = [...new Map([...(reference ? [reference] : []), ...best, ...issues].map(r => [r.id, r])).values()];
  return selected.map(r => ({id:r.id, name:r.sprite.name, description:r.sprite.description, review:r.review}));
}

// Filter first: a matching variant must stay visible even if its original is hidden.
export function groupSpriteFamilies(records, filters = {}) {
  const totals = new Map();
  for (const record of records) {
    const rootId = record.rootId ?? record.id;
    totals.set(rootId, (totals.get(rootId) ?? 0) + 1);
  }
  const groups = new Map();
  for (const record of filterSprites(records, filters)) {
    const rootId = record.rootId ?? record.id;
    if (!groups.has(rootId)) groups.set(rootId, {rootId, total: totals.get(rootId), members: []});
    groups.get(rootId).members.push(record);
  }
  return [...groups.values()];
}
