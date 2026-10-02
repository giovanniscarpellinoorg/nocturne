import {updateModelPicker,bindModelRefresh} from './model-picker.mjs';
import {request} from './cloud-ui.mjs';
import {validateSprite, paintSprite} from './pixels.mjs';
import {assetTypes, defaultGameplay, validateGameplay, itemAmountLimit} from './assets.mjs';
import {emptyReview, validateReview, filterSprites, reviewStatuses} from './sprite-review.mjs';

const $ = selector => document.querySelector(selector);
const generationModal = $('#generation-modal');
const generationPanel = $('#generation-panel');
$('#generation-modal-content').append(generationPanel);
generationPanel.hidden = false;
const drawingModal = $('#drawing-modal');
const drawingPanel = $('.design-result');
$('#drawing-modal-content').append(drawingPanel);
drawingPanel.hidden = false;

function openGenerationModal(reset = false) {
  closeDrawingModal();
  if (reset) {
    $('#reference').value = '';
    $('#make-variant').checked = false;
    $('#allow-reuse').checked = false;
    $('#brief').value = '';
    clearReferenceImage();
    generationHint();
  }
  if (!generationModal.open) {
    if (typeof generationModal.showModal === 'function') generationModal.showModal();
    else generationModal.setAttribute('open', '');
  }
  controls();
  setTimeout(() => $('#brief').focus(), 0);
}

function closeGenerationModal(force = false) {
  if (generationModal.open && (force || !busy)) {
    if (typeof generationModal.close === 'function') generationModal.close();
    else generationModal.removeAttribute('open');
  }
}

function openDrawingModal() {
  if (!drawingModal.open) {
    if (typeof drawingModal.showModal === 'function') drawingModal.showModal();
    else drawingModal.setAttribute('open', '');
  }
}

function closeDrawingModal() {
  if (drawingModal.open && !busy) {
    if (typeof drawingModal.close === 'function') drawingModal.close();
    else drawingModal.removeAttribute('open');
  }
}

let status = null, busy = false, savingKey = false, selected = null, records = [], initial = true;
let referenceImage = null, referenceImageBusy = false, referenceImageHintAdded = false;
const referenceImageHint = 'Fie-toi à l’image jointe pour guider la silhouette, les proportions et la palette.';
let progressTimer, animationTimer = null, animationIndex = 0;
let selectedLog = null, loadingLogs = false;
const methodLabel = record => record.method === 'tools' ? 'Outils de dessin' : 'Pixels directs';
let savingGameplay = false, gameplayDirty = false;
let savingReview = false, reviewDirty = false;
for (const selector of ['#asset-type', '#gameplay-type', '#history-type']) {
  for (const [type, definition] of Object.entries(assetTypes)) $(selector).add(new Option(definition.label, type));
}
$('#asset-type').value = 'character';
const generationHint = () => {$('#asset-type-hint').textContent = assetTypes[$('#asset-type').value].hint;};
generationHint();
$('#asset-type').addEventListener('change', generationHint);

function syncItemAmount() {
  if ($('#gameplay-type').value !== 'item') return;
  const effect = document.querySelector('[data-stat="effect"]').value;
  const amount = document.querySelector('[data-stat="amount"]');
  amount.max = itemAmountLimit(effect);
  amount.value = Math.min(Number(amount.value), Number(amount.max));
  amount.disabled = ['spread', 'pierce'].includes(effect);
}
function fillGameplay(profile) {
  $('#gameplay-type').value = profile.type;
  $('#gameplay-hint').textContent = assetTypes[profile.type].hint;
  $('#gameplay-fields').replaceChildren(...Object.entries(assetTypes[profile.type].fields).map(([key, field]) => {
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = document.createElement(field.type === 'select' ? 'select' : 'input');
    input.dataset.stat = key;
    if (field.type === 'select') {
      for (const [value, text] of Object.entries(field.options)) input.add(new Option(text, value));
      input.value = profile.stats[key];
    } else if (field.type === 'boolean') {
      input.type = 'checkbox'; input.checked = profile.stats[key]; label.className = 'check-label';
    } else {
      input.type = 'number'; input.min = field.min; input.max = field.max; input.step = field.step === 1 ? '1' : 'any'; input.required = true; input.value = profile.stats[key];
    }
    label.append(input); return label;
  }));
  syncItemAmount();
}

async function showLog(id) {
  if (!id) return;
  try {
    selectedLog = await request(`/api/designer/logs/${encodeURIComponent(id)}`);
    $('#log-events').textContent = selectedLog.events.map(event => {
      const {at, elapsedMs, stage, ...details} = event;
      return `+${(elapsedMs / 1000).toFixed(1)} s · ${stage}\n${JSON.stringify(details, null, 2)}`;
    }).join('\n\n');
    $('#log-raw').textContent = selectedLog.rawResponse || 'Pas encore de réponse reçue.';
    $('#log-message').textContent = `ID ${selectedLog.id} · ${selectedLog.status} · ${(selectedLog.durationMs / 1000).toFixed(1)} s${selectedLog.rawResponseTruncated ? ' · réponse brute tronquée' : ''}`;
    $('#export-log').disabled = false;
  } catch (e) {$('#log-message').textContent = e.message;}
}

async function refreshLogs(preferredId) {
  if (loadingLogs) return;
  loadingLogs = true;
  try {
    const logs = await request('/api/designer/logs');
    const previous = preferredId || (busy ? logs[0]?.id : $('#log-selection').value);
    $('#log-selection').replaceChildren(...logs.map(log => new Option(`${new Date(log.startedAt).toLocaleTimeString('fr-FR', {timeZone: 'Europe/Paris'})} · ${log.size} × ${log.size} · ${log.status} · ${log.model}`, log.id)));
    if (logs.some(log => log.id === previous)) $('#log-selection').value = previous;
    if (logs.length) await showLog($('#log-selection').value);
    else $('#log-message').textContent = 'Les prochaines générations seront journalisées. Les anciennes erreurs n’ont pas de journal.';
  } catch (e) {$('#log-message').textContent = e.message;}
  finally {loadingLogs = false;}
}

function message(text, error = false) {
  $('#design-message').textContent = text;
  $('#design-message').classList.toggle('error', error);
}

function familyMembers(record) {
  if (!record) return [];
  const root = record.rootId ?? record.id;
  return records.filter(item => (item.rootId ?? item.id) === root).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function familyLabel(record) {
  if (!record) return '';
  const members = familyMembers(record), index = members.findIndex(item => item.id === record.id);
  return record.parentId ? `Variante ${Math.max(1, index)} · famille de « ${members[0]?.sprite.name ?? record.sprite.name} » · ${members.length} version(s)` : `Original · ${members.length} version(s) dans cette famille`;
}

function clearReferenceImage() {
  referenceImage = null;
  if (referenceImageHintAdded) {
    const brief = $('#brief').value;
    $('#brief').value = brief.endsWith(`\n\n${referenceImageHint}`) ? brief.slice(0, -(`\n\n${referenceImageHint}`).length) : brief;
    referenceImageHintAdded = false;
  }
  $('#reference-image-file').value = '';
  $('#reference-image-preview').removeAttribute('src');
  $('#reference-image-name').textContent = '';
  $('#reference-image-preview-wrap').hidden = true;
}

function loadReferenceImage(file) {
  if (!file) return Promise.resolve();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('Choisis une image PNG, JPEG ou WebP.');
  if (file.size > 12 * 1024 * 1024) throw Error('Cette image dépasse 12 Mo.');
  return new Promise((resolve, reject) => {
    const source = URL.createObjectURL(file), image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(source);
      const encode = (maxSide, quality) => new Promise((resolveBlob, rejectBlob) => {
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => blob ? resolveBlob({blob, canvas}) : rejectBlob(Error('L’image n’a pas pu être préparée.')), 'image/jpeg', quality);
      });
      (async () => {
        for (const [maxSide, quality] of [[512, .65], [448, .58], [384, .5], [320, .45]]) {
          const {blob, canvas} = await encode(maxSide, quality);
          const dataUrl = await new Promise((resolveData, rejectData) => {
            const reader = new FileReader(); reader.onload = () => resolveData(String(reader.result)); reader.onerror = () => rejectData(Error('L’image n’a pas pu être lue.')); reader.readAsDataURL(blob);
          });
          const comma = dataUrl.indexOf(','), data = dataUrl.slice(comma + 1);
          if (data.length > 650000) continue;
          referenceImage = {data, mime: 'image/jpeg', name: file.name};
          const brief = $('#brief').value.trim();
          if (!brief.includes(referenceImageHint)) {
            const addition = `${brief ? `${brief}\n\n` : ''}${referenceImageHint}`;
            if (addition.length <= 1000) {$('#brief').value = addition; referenceImageHintAdded = true;}
          }
          $('#reference-image-preview').src = dataUrl;
          $('#reference-image-name').textContent = `${file.name} · ${canvas.width} × ${canvas.height}`;
          $('#reference-image-preview-wrap').hidden = false;
          resolve(); return;
        }
        reject(Error('Cette image reste trop lourde après compression. Choisis une image plus simple.'));
      })().catch(reject);
    };
    image.onerror = () => {URL.revokeObjectURL(source); reject(Error('L’image n’a pas pu être chargée.'));};
    image.src = source;
  });
}

function controls() {
  $('#draw-button').disabled = busy || referenceImageBusy || savingKey || savingGameplay || savingReview || reviewDirty || gameplayDirty || !status?.configured || status.busy;
  $('#draw-button').textContent = busy ? 'Ollama dessine…' : status?.busy ? 'Une génération est en cours…' : 'Dessiner avec Ollama';
  for (const input of document.querySelectorAll('#design-form input, #design-form textarea, #design-form select, [data-brief]')) input.disabled = busy;
  $('#save-key').disabled = busy || savingKey;
  $('#api-key').disabled = busy || savingKey;
  $('#use-reference').disabled = busy;
  for (const field of document.querySelectorAll('#gameplay-form input, #gameplay-form select')) field.disabled = busy || savingGameplay;
  if (!busy && !savingGameplay) syncItemAmount();
  $('#save-gameplay').disabled = busy || savingGameplay || !selected || !gameplayDirty;
  $('#play-asset').disabled = busy || savingGameplay || savingReview || reviewDirty || gameplayDirty || !selected?.gameplay || selected.gameplay.type === 'art';
  $('#generate-animation').disabled = busy || !selected || !status?.configured;
  $('#save-review').disabled = busy || savingReview || !selected || !reviewDirty;
  $('#create-variant').disabled = busy || savingReview || savingGameplay || !selected || reviewDirty || gameplayDirty;
  $('#close-generation').disabled = busy;
  $('#close-drawing').disabled = busy;
  for (const field of document.querySelectorAll('#review-form input, #review-form textarea, #review-form select')) field.disabled = busy || savingReview;
  $('#make-variant').disabled = busy || !$('#reference').value;
  if ($('#make-variant').checked) {$('#allow-reuse').checked = false; $('#allow-reuse').disabled = true;}
  $('.workshop-controls').setAttribute('aria-busy', String(busy));
}

async function refreshStatus() {
  try {
    status = await request('/api/status'); updateModelPicker($('#model'),status);
    $('#key-status').textContent = status.configured ? 'Clé enregistrée' : 'Clé à renseigner';
    if (initial) {
      $('#connection').open = !status.configured;
      initial = false;
    }
  } catch (e) {status = null; $('#key-status').textContent = 'Serveur indisponible'; message(e.message, true);}
  controls();
}

function repaint() {
  if (!selected) return;
  paintSprite($('#sprite-canvas'), selected.sprite, 384 / selected.sprite.width, $('#show-grid').checked);
}

function stopAnimation() {
  if (animationTimer) clearInterval(animationTimer);
  animationTimer = null;
  $('#animation-play').textContent = 'Lire';
}

function paintAnimationFrame(index = animationIndex) {
  const animation = selected?.animation;
  if (!animation?.frames?.length) {$('#animation-preview').hidden = true; stopAnimation(); return;}
  $('#animation-preview').hidden = false;
  animationIndex = (index + animation.frames.length) % animation.frames.length;
  const frame = animation.frames[animationIndex];
  paintSprite($('#animation-canvas'), frame.sprite, Math.max(1, Math.floor(256 / frame.sprite.width)), $('#show-grid').checked);
  $('#animation-frame-label').textContent = `Frame ${animationIndex + 1} / ${animation.frames.length} · ${animation.fps} FPS`;
}

function renderAnimation() {
  animationIndex = 0; stopAnimation(); paintAnimationFrame();
}

function show(record, openBoard = true) {
  selected = {...record, sprite: validateSprite(record.sprite), gameplay: validateGameplay(record.gameplay ?? defaultGameplay()), animation: record.animation};
  fillGameplay(selected.gameplay); gameplayDirty = false;
  const review = record.review ?? emptyReview(); selected.review = review; reviewDirty = false;
  $('#review-rating').value = review.rating; $('#review-status').value = review.status;
  $('#review-likes').value = review.likes; $('#review-dislikes').value = review.dislikes; $('#review-tags').value = review.tags.join(', ');
  $('#review-message').textContent = 'Avis local, modifiable sans appel IA.';
  const parent = records.find(r => r.id === record.parentId);
  $('#sprite-lineage').textContent = record.parentId ? `Variante de ${parent?.sprite.name ?? record.parentId}` : 'Dessin original';
  $('#gameplay-message').textContent = selected.gameplay.type === 'art' ? 'Attribue un type et enregistre la fiche pour tester ce dessin en jeu.' : 'Fiche enregistrée. Le test utilise ces statistiques et ce sprite.';
  const sprite = selected.sprite;
  $('#empty-drawing').hidden = true;
  $('#sprite-canvas').hidden = false;
  $('#sprite-details').hidden = false;
  $('#sprite-canvas').setAttribute('aria-label', `${sprite.name} : ${sprite.description}`);
  $('#sprite-badge').textContent = `${sprite.width} × ${sprite.height}`;
  $('#sprite-name').textContent = sprite.name;
  $('#sprite-description').textContent = sprite.description;
  const colors = [...new Set(sprite.pixels.map(p => p.rgba))];
  $('#palette').replaceChildren(...colors.map(color => {
    const swatch = document.createElement('span');
    swatch.className = 'color-swatch'; swatch.style.backgroundColor = color; swatch.title = color;
    swatch.setAttribute('role', 'img'); swatch.setAttribute('aria-label', color);
    return swatch;
  }));
  const date = new Intl.DateTimeFormat('fr-FR', {dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris'}).format(new Date(record.createdAt));
  $('#sprite-meta').textContent = `${methodLabel(record)} · ${sprite.pixels.length} pixels · ${colors.length} couleurs · ${record.model} · ${date}`;
  $('#drawing-program').hidden = !record.drawing;
  $('#export-commands').hidden = !record.drawing;
  $('#drawing-json').textContent = record.drawing ? JSON.stringify({name: sprite.name, description: sprite.description, width: sprite.width, height: sprite.height, commands: record.drawing.commands}, null, 2) : '';
  $('#sprite-json').textContent = JSON.stringify(sprite, null, 2);
  $('#pixel-inspector').textContent = 'Survole le dessin pour lire ses pixels.';
  paintSprite($('#native-canvas'), sprite);
  repaint();
  renderAnimation();
  document.querySelectorAll('.history-card').forEach(card => card.setAttribute('aria-pressed', String(card.dataset.id === selected.id)));
  controls();
  if (openBoard) openDrawingModal();
}

async function refreshHistory() {
  $('#refresh-history').disabled = true;
  try {
    const data = await request('/api/designer/sprites');
    records = data.map(record => ({...record, sprite: validateSprite(record.sprite)}));
    const reference = $('#reference').value;
    const blank = new Option('Partir d’une page blanche', '');
    $('#reference').replaceChildren(blank, ...records.map(r => new Option(`${r.sprite.name} · ${r.sprite.width} × ${r.sprite.height}`, r.id)));
    if (records.some(r => r.id === reference)) $('#reference').value = reference;
    for (const [id, options] of [['#history-model', [...new Set(records.map(r=>r.model))].map(m=>[m,m])], ['#history-family', [...new Set(records.map(r=>r.rootId??r.id))].map(id=>[id,records.find(r=>r.id===id)?.sprite.name??id])]]) {
      const previous = $(id).value; $(id).replaceChildren(new Option('Tous', 'all'), ...options.map(([value,label])=>new Option(label,value)));
      if ([...$(id).options].some(o=>o.value===previous)) $(id).value=previous;
    }
    renderHistory();
    if (!selected && records.length) show(records[0], false);
  } catch (e) {$('#history-message').textContent = `Carnet indisponible : ${e.message}`;}
  finally {$('#refresh-history').disabled = false;}
}

function renderHistory() {
    const filters = Object.fromEntries(['type','query','status','rating','size','model','family','sort'].map(key=>[key,$('#history-'+key).value]));
    const visible = filterSprites(records, filters);
    const createCard = document.createElement('button');
    createCard.type = 'button'; createCard.className = 'history-card new-sprite-card';
    createCard.setAttribute('aria-label', 'Créer un nouveau sprite');
    const plus = document.createElement('span'); plus.className = 'new-sprite-plus'; plus.textContent = '+';
    const createTitle = document.createElement('strong'); createTitle.textContent = 'Nouveau sprite';
    const createHint = document.createElement('small'); createHint.textContent = 'Ouvrir l’atelier Ollama';
    createCard.append(plus, createTitle, createHint);
    createCard.addEventListener('click', () => openGenerationModal(true));
    $('#history-list').replaceChildren(createCard, ...visible.map(record => {
      const card = document.createElement('button'), canvas = document.createElement('canvas');
      const name = document.createElement('strong'), detail = document.createElement('small');
      card.type = 'button'; card.className = 'history-card'; card.dataset.id = record.id;
      card.dataset.status = record.review?.status ?? 'draft';
      card.dataset.variant = String(Boolean(record.parentId));
      card.setAttribute('aria-pressed', String(selected?.id === record.id));
      canvas.setAttribute('aria-hidden', 'true');
      paintSprite(canvas, record.sprite, 4);
      name.textContent = record.sprite.name;
      detail.textContent = `${assetTypes[record.gameplay?.type ?? 'art'].label} · ${record.sprite.width} × ${record.sprite.height} · ${methodLabel(record)}${record.animation ? ' · Animation' : ''}`;
      const family = document.createElement('span'); family.className = 'history-family'; family.textContent = familyLabel(record);
      const rating = document.createElement('span'); rating.className = 'sprite-rating';
      rating.textContent = `${record.review?.rating ? '★'.repeat(record.review.rating) : 'Non noté'} · ${reviewStatuses[record.review?.status ?? 'draft']}${record.parentId ? ' · Variante' : ''}`;
      card.append(canvas, name, detail, family, rating);
      card.addEventListener('click', () => {if (!savingGameplay && !savingReview) {if (reviewDirty || gameplayDirty) {message('Enregistre tes modifications avant de changer de sprite.', true); return;} show(record);}});
      return card;
    }));
    $('#history-message').textContent = records.length ? `${visible.length} / ${records.length} dessins affichés.` : 'Commence par la carte « Nouveau sprite » pour ouvrir l’atelier.';
}

$('#design-form').addEventListener('submit', async event => {
  event.preventDefault();
  if ($('#draw-button').disabled) return;
  const body = {assetType: $('#asset-type').value, method: $('#method').value, prompt: $('#brief').value.trim(), size: Number($('#size').value), model: $('#model').value, allowReuse: $('#allow-reuse').checked};
  if ($('#reference').value) body.referenceId = $('#reference').value;
  if (referenceImage) {body.referenceImage = referenceImage.data; body.referenceImageMime = referenceImage.mime;}
  body.variant = $('#make-variant').checked; body.useFeedback = $('#use-feedback').checked;
  busy = true; controls(); message('');
  $('#design-progress').hidden = false;
  const start = Date.now();
  const progress = () => {$('#progress-message').textContent = `Ollama dessine (${body.method === 'tools' ? 'avec les outils' : 'pixels directs'}) · ${Math.floor((Date.now() - start) / 1000)} s. Le dessin apparaîtra une fois complet. Cela peut prendre plus de deux minutes.`;};
  progress(); progressTimer = setInterval(progress, 1000);
  try {
    const result = await request('/api/designer/generate', {method: 'POST', body, timeoutMs: body.size >= 32 ? 320000 : 155000});
    show(result.record, false);
    message(result.reused ? 'Ollama a choisi de réutiliser ce dessin enregistré, à l’identique.' : 'Ollama a dessiné ce sprite. Les pixels sont vérifiés et le dessin est enregistré.');
    if (result.diagnostics?.format === 'commands') message(`Dessin enregistré : ${result.diagnostics.commandCount} commandes converties en ${result.record.sprite.pixels.length} pixels. Les commandes sont consultables sous le dessin.`);
    const corrections = [];
    if (result.diagnostics?.duplicatePixels) corrections.push(`${result.diagnostics.duplicatePixels} pixel(s) dupliqué(s) corrigé(s), dernière couleur conservée`);
    if (result.diagnostics?.gridRepairs?.length) corrections.push(`${result.diagnostics.gridRepairs.length} ajustement(s) des marges transparentes, positions des pixels colorés conservées`);
    if (corrections.length) {
      message(`Dessin enregistré : ${corrections.join(' ; ')}. Détails dans le journal.`);
      $('#design-logs').open = true;
    }
    if (result.logSaved === false) message('Dessin enregistré, mais le journal n’a pas pu être sauvegardé sur le disque.', true);
    await refreshLogs(result.diagnosticId);
    await refreshHistory();
    closeGenerationModal(true);
    openDrawingModal();
  } catch (e) {
    message(e.message, true);
    $('#design-logs').open = true;
    await refreshLogs(e.diagnosticId);
    if (e.logSaved === false) $('#log-message').textContent = 'Le journal n’a pas pu être enregistré. Consulte la sortie du serveur dans le terminal.';
    if (e.status === 401 || e.status === 503) $('#connection').open = true;
  } finally {
    clearInterval(progressTimer); busy = false; $('#design-progress').hidden = true;
    await refreshStatus(); controls();
  }
});

$('#connection-form').addEventListener('submit', async event => {
  event.preventDefault(); savingKey = true; controls();
  let key = $('#api-key').value.trim(); $('#api-key').value = '';
  try {
    await request('/api/config', {method: 'POST', body: {key, model: $('#model').value}});
    key = ''; $('#connection-message').textContent = 'Clé enregistrée. Elle sera vérifiée par Ollama au premier dessin.';
    await refreshStatus();
  } catch (e) {$('#connection-message').textContent = e.message;}
  finally {key = ''; savingKey = false; controls();}
});

$('#close-generation').addEventListener('click', closeGenerationModal);
$('#open-generation').addEventListener('click', event => {event.preventDefault(); event.stopPropagation(); openGenerationModal(true);});
generationModal.addEventListener('cancel', event => {if (busy) event.preventDefault();});
generationModal.addEventListener('click', event => {if (event.target === generationModal) closeGenerationModal();});
$('#close-drawing').addEventListener('click', closeDrawingModal);
drawingModal.addEventListener('cancel', event => {if (busy) event.preventDefault();});
drawingModal.addEventListener('click', event => {if (event.target === drawingModal) closeDrawingModal();});

document.querySelectorAll('[data-brief]').forEach(button => button.addEventListener('click', () => {$('#brief').value = button.dataset.brief; $('#brief').focus();}));
$('#reference-image-file').addEventListener('change', async event => {
  referenceImageBusy = true; controls();
  try {await loadReferenceImage(event.target.files[0]); $('#reference-image-message').textContent = 'Image réduite et prête à guider Ollama.';}
  catch (e) {clearReferenceImage(); $('#reference-image-message').textContent = e.message;}
  finally {referenceImageBusy = false; controls();}
});
$('#clear-reference-image').addEventListener('click', () => {clearReferenceImage(); controls();});
$('#show-grid').addEventListener('change', repaint);
$('#background').addEventListener('change', () => {$('#drawing-stage').dataset.background = $('#background').value;});
$('#method').addEventListener('change', () => {$('#method-hint').textContent = $('#method').value === 'tools' ? 'Ollama compose avec des formes et des traits, puis affine les détails pixel par pixel.' : 'Ollama fournit directement les pixels, ou une grille de couleurs pour les grandes tailles.';});
$('#size').addEventListener('change', () => {if (!selected) $('#sprite-badge').textContent = `${$('#size').value} × ${$('#size').value}`;});
$('#refresh-history').addEventListener('click', refreshHistory);
for (const field of document.querySelectorAll('.history-filters input, .history-filters select')) field.addEventListener('input', renderHistory);
$('#reference').addEventListener('change', () => {if (!$('#reference').value) $('#make-variant').checked=false; controls();});
$('#make-variant').addEventListener('change', controls);
$('#review-form').addEventListener('input', () => {reviewDirty=true; $('#review-message').textContent='Avis non enregistré. Enregistre-le avant de créer une variante.'; controls();});
$('#review-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!selected || savingReview || busy) return;
  try {
    const review=validateReview({rating:Number($('#review-rating').value),status:$('#review-status').value,likes:$('#review-likes').value,dislikes:$('#review-dislikes').value,tags:$('#review-tags').value.split(',').map(t=>t.trim()).filter(Boolean)});
    savingReview=true; controls();
    const updated=await request('/api/designer/review',{method:'POST',body:{id:selected.id,review}});
    selected.review=updated.review; reviewDirty=false;
    $('#review-message').textContent='Avis enregistré. Il sera utilisé si « Transmettre mes notes » est coché.';
    await refreshHistory();
  } catch(e) {$('#review-message').textContent=e.message;} finally {savingReview=false; controls();}
});
$('#create-variant').addEventListener('click', () => {
  if ($('#create-variant').disabled) return;
  $('#reference').value=selected.id; $('#size').value=selected.sprite.width; $('#asset-type').value=selected.gameplay.type;
  $('#method').value=selected.method??'tools'; $('#make-variant').checked=true; $('#allow-reuse').checked=false; $('#use-feedback').checked=true;
  $('#brief').value=`Nouvelle variante de « ${selected.sprite.name} ». ${selected.review.dislikes ? 'À améliorer : '+selected.review.dislikes : 'Conserve son identité et propose une autre version.'}`.slice(0,1000);
  generationHint(); openGenerationModal();
  message('Précise la variante souhaitée puis clique sur Dessiner. L’original sera conservé.');
});
$('#show-family').addEventListener('click', () => {if(selected){$('#history-family').value=selected.rootId??selected.id;$('#history-type').value='all';$('#history-status').value='all';$('#history-rating').value='0';$('#history-query').value='';$('#history-size').value='all';$('#history-model').value='all';renderHistory();document.querySelector('.design-history').scrollIntoView({behavior:'smooth',block:'start'});}});
$('#gameplay-type').addEventListener('change', () => {
  fillGameplay(defaultGameplay($('#gameplay-type').value)); gameplayDirty = true;
  $('#gameplay-message').textContent = 'Enregistre la fiche avant de lancer le test.'; controls();
});
$('#gameplay-fields').addEventListener('input', () => {gameplayDirty = true; syncItemAmount(); $('#gameplay-message').textContent = 'Modifications non enregistrées.'; controls();});
$('#gameplay-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!selected || busy || savingGameplay) return;
  const type = $('#gameplay-type').value, stats = {};
  for (const field of document.querySelectorAll('[data-stat]')) stats[field.dataset.stat] = field.type === 'checkbox' ? field.checked : field.type === 'number' ? Number(field.value) : field.value;
  try {
    const gameplay = validateGameplay({type, stats}); savingGameplay = true; controls();
    const record = await request('/api/designer/gameplay', {method: 'POST', body: {id: selected.id, gameplay}});
    selected.gameplay=record.gameplay; selected.updatedAt=record.updatedAt; gameplayDirty=false; fillGameplay(record.gameplay); $('#gameplay-message').textContent = 'Fiche enregistrée sans appel IA. Tu peux tester ce sprite en jeu.';
    await refreshHistory();
  } catch (e) {$('#gameplay-message').textContent = e.message;}
  finally {savingGameplay = false; controls();}
});
$('#animation-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!selected || busy || $('#generate-animation').disabled) return;
  busy = true; controls(); $('#animation-message').textContent = 'Ollama construit les frames en conservant le sprite de base…';
  try {
    const result = await request('/api/designer/animation', {method: 'POST', body: {spriteId: selected.id, type: $('#animation-type').value, fps: Number($('#animation-fps').value), frames: Number($('#animation-frames').value), prompt: $('#animation-prompt').value.trim(), model: $('#model').value}, timeoutMs: selected.sprite.width >= 32 ? 320000 : 190000});
    selected = {...selected, ...result.record, animation: result.animation};
    renderAnimation();
    $('#animation-message').textContent = `Animation enregistrée : ${result.animation.frames.length} frames à ${result.animation.fps} FPS.`;
    await refreshHistory(); await refreshLogs(result.diagnosticId);
  } catch (e) {
    $('#animation-message').textContent = e.message;
    $('#design-logs').open = true; await refreshLogs(e.diagnosticId);
  } finally {busy = false; controls();}
});
$('#animation-play').addEventListener('click', () => {
  if (animationTimer) {stopAnimation(); return;}
  const animation = selected?.animation; if (!animation?.frames?.length) return;
  $('#animation-play').textContent = 'Pause';
  animationTimer = setInterval(() => paintAnimationFrame(animationIndex + 1), Math.round(1000 / animation.fps));
});
$('#animation-prev').addEventListener('click', () => {stopAnimation(); paintAnimationFrame(animationIndex - 1);});
$('#animation-next').addEventListener('click', () => {stopAnimation(); paintAnimationFrame(animationIndex + 1);});
$('#play-asset').addEventListener('click', () => {if (!$('#play-asset').disabled) location.href = `/?asset=${encodeURIComponent(selected.id)}`;});
$('#refresh-logs').addEventListener('click', () => refreshLogs());
$('#log-selection').addEventListener('change', () => showLog($('#log-selection').value));
$('#export-log').addEventListener('click', () => {
  if (!selectedLog) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(selectedLog, null, 2)], {type: 'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = `ollama-designer-log-${selectedLog.id}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#use-reference').addEventListener('click', () => {
  if (!selected || busy) return;
  $('#reference').value = selected.id; $('#size').value = String(selected.sprite.width);
  $('#asset-type').value = selected.gameplay.type; generationHint();
  $('#brief').value = `À partir de « ${selected.sprite.name} », `;
  openGenerationModal();
  message('Décris les modifications à apporter. Ollama recevra les pixels du dessin de référence.');
});
$('#sprite-canvas').addEventListener('pointermove', event => {
  if (!selected) return;
  const rect = event.currentTarget.getBoundingClientRect(), sprite = selected.sprite;
  const x = Math.floor((event.clientX - rect.left) / rect.width * sprite.width), y = Math.floor((event.clientY - rect.top) / rect.height * sprite.height);
  if (x < 0 || y < 0 || x >= sprite.width || y >= sprite.height) return;
  const pixel = sprite.pixels.find(p => p.x === x && p.y === y);
  $('#pixel-inspector').textContent = `{ x: ${x}, y: ${y}, rgba: "${pixel?.rgba || '#00000000'}" }${pixel ? '' : ' · transparent'}`;
});

function download(blob, extension) {
  if (!blob || !selected) return;
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `nocturne-${selected.id}.${extension}`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#export-json').addEventListener('click', () => {if (selected) download(new Blob([JSON.stringify(selected.sprite, null, 2)], {type: 'application/json'}), 'json');});
$('#export-commands').addEventListener('click', () => {if (selected?.drawing) download(new Blob([$('#drawing-json').textContent], {type: 'application/json'}), 'commands.json');});
$('#export-png').addEventListener('click', () => {
  if (!selected) return;
  const canvas = document.createElement('canvas'); paintSprite(canvas, selected.sprite);
  canvas.toBlob(blob => download(blob, 'png'), 'image/png');
});

bindModelRefresh(refreshStatus);
await Promise.all([refreshStatus(), refreshHistory(), refreshLogs()]);
const statusTimer = setInterval(() => {if (!document.hidden && !busy) refreshStatus();}, 15000);
const logTimer = setInterval(() => {if (!document.hidden && busy) refreshLogs();}, 5000);
window.addEventListener('pagehide', () => {$('#api-key').value = ''; clearInterval(progressTimer); clearInterval(statusTimer); clearInterval(logTimer);});
