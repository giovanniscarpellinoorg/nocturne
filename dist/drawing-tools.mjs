// Pure integer-grid renderer, shared by the server and tests. No generated code runs.
export function rasterizeCommands(input, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 64 || height > 64) throw Error('Dimensions des outils invalides');
  if (!Array.isArray(input) || !input.length || input.length > 256) throw Error('Le dessin doit contenir entre 1 et 256 commandes');
  const surface = new Map(), commands = [], tools = {};
  let paintedPixels = 0, repaintedPixels = 0;
  function paint(x, y, rgba) {
    paintedPixels++;
    const key = y * width + x;
    if (surface.has(key)) repaintedPixels++;
    if (rgba.endsWith('00')) surface.delete(key);
    else surface.set(key, {x, y, rgba});
  }
  function line(from, to, color) {
    let [x, y] = from;
    const [endX, endY] = to, dx = Math.abs(endX - x), dy = -Math.abs(endY - y);
    const sx = x < endX ? 1 : -1, sy = y < endY ? 1 : -1;
    let error = dx + dy;
    while (true) {
      paint(x, y, color);
      if (x === endX && y === endY) break;
      const doubled = error * 2;
      if (doubled >= dy) {error += dy; x += sx;}
      if (doubled <= dx) {error += dx; y += sy;}
    }
  }
  input.forEach((raw, index) => {
    const fail = text => {throw Error(`Commande[${index}] : ${text}`);};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('objet attendu');
    const allowed = {
      pixel: ['x', 'y'], rectangle: ['x', 'y', 'largeur', 'hauteur'], ellipse: ['x', 'y', 'largeur', 'hauteur'],
      ligne: ['de', 'vers'], polygone: ['points'],
    };
    if (!Object.hasOwn(allowed, raw.outil)) fail('outil inconnu');
    const keys = ['outil', 'couleur', ...allowed[raw.outil]];
    if (Object.keys(raw).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(raw, k))) fail(`champs attendus : ${keys.join(', ')}`);
    if (typeof raw.couleur !== 'string' || !/^#[\da-f]{6}([\da-f]{2})?$/i.test(raw.couleur)) fail('couleur attendue #RRGGBB ou #RRGGBBAA');
    const color = raw.couleur.toUpperCase() + (raw.couleur.length === 7 ? 'FF' : '');
    function point(value) {
      if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isInteger) || value[0] < 0 || value[0] >= width || value[1] < 0 || value[1] >= height) fail(`coordonnées hors de la grille ${width} × ${height}`);
      return [...value];
    }
    let command = {outil: raw.outil, couleur: color};
    if (['pixel', 'rectangle', 'ellipse'].includes(raw.outil)) {
      const [x, y] = point([raw.x, raw.y]);
      Object.assign(command, {x, y});
      if (raw.outil === 'pixel') paint(x, y, color);
      else {
        const w = raw.largeur, h = raw.hauteur;
        if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || x + w > width || y + h > height) fail('dimensions de la forme hors de la grille');
        Object.assign(command, {largeur: w, hauteur: h});
        for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
          if (raw.outil === 'rectangle' || ((px + .5 - w / 2) / (w / 2)) ** 2 + ((py + .5 - h / 2) / (h / 2)) ** 2 <= 1) paint(x + px, y + py, color);
        }
      }
    } else if (raw.outil === 'ligne') {
      command.de = point(raw.de); command.vers = point(raw.vers);
      line(command.de, command.vers, color);
    } else {
      if (!Array.isArray(raw.points) || raw.points.length < 3 || raw.points.length > 32) fail('polygone : 3 à 32 sommets attendus');
      command.points = raw.points.map(point);
      const points = command.points;
      // Even-odd fill at pixel centers, followed by a one-pixel boundary.
      for (let y = Math.min(...points.map(p => p[1])); y <= Math.max(...points.map(p => p[1])); y++) {
        for (let x = Math.min(...points.map(p => p[0])); x <= Math.max(...points.map(p => p[0])); x++) {
          let inside = false;
          for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const [ax, ay] = points[i], [bx, by] = points[j];
            if ((ay > y + .5) !== (by > y + .5) && x + .5 < (bx - ax) * (y + .5 - ay) / (by - ay) + ax) inside = !inside;
          }
          if (inside) paint(x, y, color);
        }
      }
      points.forEach((p, i) => line(p, points[(i + 1) % points.length], color));
    }
    commands.push(command);
    tools[raw.outil] = (tools[raw.outil] || 0) + 1;
  });
  return {pixels: [...surface.values()].sort((a, b) => a.y - b.y || a.x - b.x), commands, stats: {commandCount: commands.length, tools, paintedPixels, repaintedPixels}};
}

export function drawingInstructions(size) {
  return `Dessine avec des outils géométriques, exécutés dans l'ordre du fond vers les détails, sur une grille ${size} × ${size} initialement transparente. Aucune bibliothèque de sprites, aucune image externe, aucun code.
Réponds uniquement avec {"name":"Nom court","description":"Description courte","width":${size},"height":${size},"commands":[...]}. Ne fournis pas pixels, rows ou palette.
Les commandes autorisées (exemples de syntaxe, pas un dessin à recopier) sont :
{"outil":"pixel","x":2,"y":2,"couleur":"#AABBCC"}
{"outil":"rectangle","x":1,"y":1,"largeur":4,"hauteur":3,"couleur":"#AABBCC"}
{"outil":"ellipse","x":1,"y":1,"largeur":4,"hauteur":3,"couleur":"#AABBCC"}
{"outil":"ligne","de":[1,1],"vers":[5,5],"couleur":"#AABBCC"}
{"outil":"polygone","points":[[1,1],[5,1],[3,5]],"couleur":"#AABBCC"}
Les coordonnées sont entières entre 0 et ${size - 1}, origine en haut à gauche. Rectangles et ellipses sont pleins : x/y = coin supérieur gauche ; largeur/hauteur = dimensions en pixels. Leur boîte doit tenir dans la grille. Lignes : 1 pixel d'épaisseur, extrémités incluses. Polygones pleins, 3 à 32 sommets. Dessine des rectangles pour les traits épais et superpose des formes plus petites pour les contours. Chaque outil remplace les pixels précédents ; #00000000 efface. Pas de mélange de couleurs ni d'anticrénelage.
Maximum 256 commandes et 16 couleurs finales. Vise une composition lisible occupant une bonne partie de la grille, avec une marge. Construis d'abord la silhouette avec quelques formes principales, puis les ombres et détails. Pour un texte, dessine toi-même chaque lettre avec des traits et des formes : respecte son orthographe, réserve sa largeur et les espaces avant de placer les lettres. Aucun outil texte ou police intégrée.`;
}
