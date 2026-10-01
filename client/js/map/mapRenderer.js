// Rendu de carte par masque de couleur (cahier des charges §3 ; FEATURES_SPEC.md §2).
// Le masque attribue une couleur RVB unique à chaque province. Le clic ou le survol lit la
// couleur du pixel pour identifier la province. Le calque affiché est recalculé pixel par
// pixel à partir du mode de carte, du propriétaire et de la visibilité (brouillard, §10).

const FOG_HIDDEN = [74, 66, 55];        // hidden : aplat opaque, aucune frontière
const PARTIAL_BORDER = [70, 58, 44];    // partially_known : contour approximatif seul
const NATION_BORDER = [34, 28, 22];
const PROVINCE_BORDER = [110, 96, 78];
const WALL_LINE = [236, 228, 208];      // tracé distinct des Murs (états fortifiés de Paradis)
const WALL_OUTLINE = [30, 26, 20];
const HAZARD = [122, 36, 24];           // hachures « ancien territoire des Titans purs »
const SEA_NO_BACKGROUND = [196, 182, 150];
const NEUTRAL = [150, 140, 120];
const FRONT_LINE = [176, 28, 20];        // front entre nations en guerre (FEATURES §13)

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export class MapRenderer {
  constructor(container, { onHover = () => {}, onSelect = () => {}, onContextMenu = () => {}, onCombatClick = () => {} } = {}) {
    this.container = container;
    this.onHover = onHover;
    this.onSelect = onSelect;
    this.onContextMenu = onContextMenu;
    this.onCombatClick = onCombatClick;
    this.military = { divisions: [], combats: [], wars: [] };
    this.viewerId = null;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map-canvas';
    this.canvas.tabIndex = 0;
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.layer = document.createElement('canvas');
    this.highlight = document.createElement('canvas');
    this.mode = 'political';
    this.view = { scale: 1, ox: 0, oy: 0 };
    this.provinces = [];
    this.selectedIndex = -1;
    this.hoverIndex = -1;
    this.pointers = new Map();
    this.bindInput();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
  }

  async load({ maskUrl, backgroundUrl, wallRings = null }) {
    this.wallRings = wallRings;
    const mask = await loadImage(maskUrl);
    this.width = mask.naturalWidth;
    this.height = mask.naturalHeight;
    const c = document.createElement('canvas');
    c.width = this.width;
    c.height = this.height;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(mask, 0, 0);
    const px = cx.getImageData(0, 0, this.width, this.height).data;
    this.maskKeys = new Int32Array(this.width * this.height);
    for (let i = 0, p = 0; i < this.maskKeys.length; i++, p += 4) {
      this.maskKeys[i] = (px[p] << 16) | (px[p + 1] << 8) | px[p + 2];
    }
    this.background = null;
    if (backgroundUrl) {
      try { this.background = await loadImage(backgroundUrl); } catch { this.background = null; }
    }
    for (const cv of [this.layer, this.highlight]) { cv.width = this.width; cv.height = this.height; }
    this.resize();
    this.fit();
  }

  /** @param {{provinces: any[], nations: any[]}} view Vue filtrée par le serveur. */
  setData(view) {
    this.provinces = view.provinces;
    this.nationColors = new Map(view.nations.map((n) => [n.id, hexToRgb(n.colors?.primary ?? '#968c78')]));
    const byKey = new Map(this.provinces.map((p, i) => [parseInt(p.color.replace('#', ''), 16), i]));
    if (this.maskKeys) {
      this.pixelProvince = new Int32Array(this.maskKeys.length);
      for (let i = 0; i < this.maskKeys.length; i++) this.pixelProvince[i] = byKey.get(this.maskKeys[i]) ?? -1;
    }
    this.viewerId = view.viewerId;
    this.military = view.military ?? { divisions: [], combats: [], wars: [] };
    this.warSet = new Set((this.military.wars ?? []).map(([a, b]) => [a, b].sort().join('|')));
    this.computeCentroids();
    this.maxDeposit = Math.max(1, ...this.provinces.map((p) => {
      const r = p.resourceDeposits;
      return r ? (r.steel ?? 0) + (r.fuel ?? 0) + (r.rareMaterials ?? 0) : 0;
    }));
    this.renderLayer();
    this.renderHighlight();
  }

  /** Mise à jour militaire légère (pions, combats) sans recalcul du calque. */
  setMilitary(military) {
    this.military = military;
    this.warSet = new Set((military.wars ?? []).map(([a, b]) => [a, b].sort().join('|')));
    this.draw();
  }

  computeCentroids() {
    if (!this.pixelProvince) return;
    const n = this.provinces.length;
    const sx = new Float64Array(n); const sy = new Float64Array(n); const c = new Float64Array(n);
    for (let i = 0; i < this.pixelProvince.length; i++) {
      const idx = this.pixelProvince[i];
      if (idx < 0) continue;
      sx[idx] += i % this.width; sy[idx] += Math.floor(i / this.width); c[idx] += 1;
    }
    this.centroids = new Map();
    this.provinces.forEach((p, i) => { if (c[i]) this.centroids.set(p.id, { x: sx[i] / c[i] + 0.5, y: sy[i] / c[i] + 0.5 }); });
  }

  atWar(a, b) {
    return a && b && a !== b && this.warSet?.has([a, b].sort().join('|'));
  }

  setMode(mode) {
    this.mode = mode;
    this.renderLayer();
  }

  renderLayer() {
    if (!this.pixelProvince) return;
    const { width: w, height: h } = this;
    const lx = this.layer.getContext('2d', { willReadFrequently: true });
    lx.clearRect(0, 0, w, h);
    if (this.background) lx.drawImage(this.background, 0, 0, w, h);
    else { lx.fillStyle = `rgb(${SEA_NO_BACKGROUND})`; lx.fillRect(0, 0, w, h); }
    const img = lx.getImageData(0, 0, w, h);
    const d = img.data;
    const pp = this.pixelProvince;
    const provs = this.provinces;
    const owner = (i) => (i < 0 ? null : provs[i].ownerId ?? null);
    const known = (i) => i >= 0 && provs[i].visibility === 'known';

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const idx = pp[i];
        if (idx < 0) continue; // mer / pixel sans province : fond visible
        const p = provs[idx];
        const o = i * 4;
        const base = [d[o], d[o + 1], d[o + 2]];
        const nbrs = [x > 0 ? pp[i - 1] : -1, x < w - 1 ? pp[i + 1] : -1, y > 0 ? pp[i - w] : -1, y < h - 1 ? pp[i + w] : -1];
        const isBorder = nbrs.some((n) => n !== idx);
        let out;

        if (this.mode === 'fog_of_war') {
          out = p.visibility === 'known' ? mix(base, [236, 226, 200], 0.25)
            : p.visibility === 'partially_known' ? mix(base, [150, 132, 104], 0.6)
            : FOG_HIDDEN;
          if (isBorder && p.visibility !== 'hidden') out = PARTIAL_BORDER;
        } else if (p.visibility === 'hidden') {
          out = FOG_HIDDEN;
        } else if (p.visibility === 'partially_known') {
          // contour approximatif en pointillés, ni remplissage ni propriétaire
          out = isBorder && ((x + y) >> 1) % 2 === 0 ? PARTIAL_BORDER : mix(base, FOG_HIDDEN, 0.35);
        } else {
          const fill = this.modeFill(p, x, y);
          out = mix(base, fill, this.mode === 'political' ? 0.68 : 0.7);
          if (p.formerPureTitanTerritory && (x + y) % 7 < 2) out = mix(out, HAZARD, 0.7);
          if (isBorder) {
            const nationEdge = nbrs.some((n) => n !== idx && (!known(n) || owner(n) !== p.ownerId));
            out = nationEdge ? NATION_BORDER : mix(out, PROVINCE_BORDER, 0.6);
            if (this.mode === 'front_combat' && nbrs.some((n) => n >= 0 && n !== idx && this.atWar(provs[n].controllerId, p.controllerId))) out = FRONT_LINE;
          }
          if (p.isWallState && !this.wallRings) {
            // Mur : ligne claire de 2 px cernée de sombre, le long du bord de l'état fortifié
            const edge2 = [pp[i - 2 * w], pp[i + 2 * w], x > 1 ? pp[i - 2] : -1, x < w - 2 ? pp[i + 2] : -1]
              .some((n) => n !== undefined && n !== idx);
            if (isBorder) out = WALL_OUTLINE;
            else if (edge2) out = WALL_LINE;
          }
        }
        d[o] = out[0]; d[o + 1] = out[1]; d[o + 2] = out[2]; d[o + 3] = 255;
      }
    }
    lx.putImageData(img, 0, 0);
    this.draw();
  }

  /** Couleur de remplissage d'une province connue selon le mode de carte (FEATURES §2). */
  modeFill(p, x, y) {
    if (this.mode === 'resources') {
      // Somme des gisements de l'état ; hachures neutres si la donnée n'est pas renseignée.
      const r = p.resourceDeposits;
      if (!r) return (x + y) % 6 < 3 ? NEUTRAL : SEA_NO_BACKGROUND;
      const total = (r.steel ?? 0) + (r.fuel ?? 0) + (r.rareMaterials ?? 0);
      return mix([236, 226, 196], [120, 70, 20], Math.min(1, total / this.maxDeposit));
    }
    if (this.mode === 'supply') {
      // supply_value 0..1 (MECHANICS §3.4) ; < 0.5 = pénalité d'attrition (§6.4)
      if (p.supplyValue == null) return (x + y) % 6 < 3 ? NEUTRAL : SEA_NO_BACKGROUND;
      return p.supplyValue < 0.5 ? mix([150, 40, 25], [214, 170, 60], p.supplyValue / 0.5)
        : mix([214, 170, 60], [75, 93, 58], (p.supplyValue - 0.5) / 0.5);
    }
    if (this.mode === 'front_combat') return this.nationColors.get(p.controllerId) ?? NEUTRAL;
    return this.nationColors.get(p.ownerId) ?? NEUTRAL;
  }

  renderHighlight() {
    if (!this.pixelProvince) return;
    const hx = this.highlight.getContext('2d');
    hx.clearRect(0, 0, this.width, this.height);
    const sel = this.selectedIndex;
    if (sel >= 0 && this.provinces[sel]?.visibility === 'known') {
      const img = hx.createImageData(this.width, this.height);
      for (let i = 0; i < this.pixelProvince.length; i++) {
        if (this.pixelProvince[i] === sel) { const o = i * 4; img.data[o] = 255; img.data[o + 1] = 244; img.data[o + 2] = 200; img.data[o + 3] = 110; }
      }
      hx.putImageData(img, 0, 0);
    }
    this.draw();
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.canvas.style.width = `${r.width}px`;
    this.canvas.style.height = `${r.height}px`;
    this.dpr = dpr;
    this.draw();
  }

  fit() {
    if (!this.width) return;
    const r = this.container.getBoundingClientRect();
    const scale = Math.min(r.width / this.width, r.height / this.height) || 1;
    this.view = { scale, ox: (r.width - this.width * scale) / 2, oy: (r.height - this.height * scale) / 2 };
    this.draw();
  }

  draw() {
    const { ctx, dpr } = this;
    if (!ctx || !dpr) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.width) return;
    const { scale, ox, oy } = this.view;
    ctx.imageSmoothingEnabled = scale < 2;
    ctx.drawImage(this.layer, ox, oy, this.width * scale, this.height * scale);
    ctx.drawImage(this.highlight, ox, oy, this.width * scale, this.height * scale);
    this.drawOverlay();
  }

  toScreen({ x, y }) {
    return { x: this.view.ox + x * this.view.scale, y: this.view.oy + y * this.view.scale };
  }

  /**
   * Murs tracés en vectoriel (cercles de la carte, data/map/provinces.json « wallRings ») : un trait
   * d'épaisseur constante à l'écran, quel que soit le zoom. Seules les portions posées sur un état
   * de Mur connu sont dessinées.
   */
  drawWalls() {
    const { ctx } = this;
    // Les provinces du masque sont attribuées selon les coordonnées entières des pixels : le centre
    // du pixel (x + 0,5) sert de référence pour le tracé.
    const [cx, cy] = this.wallRings.center.map((v) => v + 0.5);
    const { rings } = this.wallRings;
    const onWall = (x, y) => {
      const xi = Math.floor(x); const yi = Math.floor(y);
      if (xi < 0 || yi < 0 || xi >= this.width || yi >= this.height) return false;
      const p = this.provinces[this.pixelProvince[yi * this.width + xi]];
      return Boolean(p?.isWallState && p.visibility === 'known');
    };
    const width = Math.max(2, Math.min(6, this.view.scale * 0.9));
    ctx.save();
    ctx.lineCap = 'round';
    for (const { radius } of rings) {
      const steps = Math.max(48, Math.ceil(radius * 8));
      const runs = [];
      let run = null;
      for (let k = 0; k <= steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const x = cx + Math.cos(a) * radius; const y = cy + Math.sin(a) * radius;
        // pixel juste à l'intérieur du cercle : il appartient à l'état que ce Mur entoure
        if (onWall(cx + Math.cos(a) * (radius - 1.5), cy + Math.sin(a) * (radius - 1.5))) {
          if (!run) { run = []; runs.push(run); }
          run.push(this.toScreen({ x, y }));
        } else run = null;
      }
      for (const [stroke, w] of [[WALL_OUTLINE, width + 2], [WALL_LINE, width]]) {
        ctx.strokeStyle = `rgb(${stroke})`;
        ctx.lineWidth = w;
        for (const r of runs) {
          if (r.length < 2) continue;
          ctx.beginPath();
          r.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  /** Pions de divisions (par nation et par province) et icônes de combat (FEATURES §2, §13). */
  drawOverlay() {
    if (!this.centroids) return;
    const { ctx } = this;
    if (this.wallRings && this.pixelProvince) this.drawWalls();
    const byProvince = new Map();
    for (const d of this.military.divisions ?? []) {
      if (!byProvince.has(d.locationProvinceId)) byProvince.set(d.locationProvinceId, new Map());
      const m = byProvince.get(d.locationProvinceId);
      m.set(d.nationId, (m.get(d.nationId) ?? 0) + 1);
    }
    ctx.font = '600 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [pid, nations] of byProvince) {
      const c = this.centroids.get(pid);
      if (!c) continue;
      const s = this.toScreen(c);
      let offset = -((nations.size - 1) * 26) / 2;
      const naval = (this.military.divisions ?? []).some((d) => d.locationProvinceId === pid && (d.amphibious || d.movement?.naval));
      for (const [nid, count] of nations) {
        const col = this.nationColors.get(nid) ?? NEUTRAL;
        const x = s.x + offset; const y = s.y + 14;
        ctx.fillStyle = `rgb(${col})`;
        ctx.strokeStyle = nid === this.viewerId ? '#f6eed9' : '#1e1810';
        ctx.lineWidth = 2;
        ctx.fillRect(x - 12, y - 8, 24, 16);
        ctx.strokeRect(x - 12, y - 8, 24, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(naval && nid === this.viewerId ? `${count}⚓` : String(count), x, y + 0.5);
        offset += 26;
      }
    }
    // Routes maritimes (débarquements) en mode Fronts
    if (this.mode === 'front_combat') {
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(43, 58, 85, 0.75)';
      ctx.lineWidth = 2;
      const drawn = new Set();
      for (const [a, list] of Object.entries(this.military.seaAdjacency ?? {})) {
        for (const b of list) {
          const key = [a, b].sort().join('|');
          if (drawn.has(key)) continue;
          drawn.add(key);
          const pa = this.provinces.find((p) => p.id === a);
          const pb = this.provinces.find((p) => p.id === b);
          if (pa?.visibility !== 'known' || pb?.visibility !== 'known') continue;
          const ca = this.centroids.get(a); const cb = this.centroids.get(b);
          if (!ca || !cb) continue;
          const sa = this.toScreen(ca); const sb = this.toScreen(cb);
          ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
        }
      }
      ctx.restore();
    }
    this.combatHits = [];
    for (const c of this.military.combats ?? []) {
      const cen = this.centroids.get(c.provinceId);
      if (!cen) continue;
      const s = this.toScreen(cen);
      const y = s.y - 12;
      ctx.beginPath();
      ctx.arc(s.x, y, 11, 0, Math.PI * 2);
      ctx.fillStyle = '#8e2a1c';
      ctx.fill();
      ctx.strokeStyle = '#f6eed9';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '13px sans-serif';
      ctx.fillText('⚔', s.x, y + 1);
      ctx.font = '600 11px Inter, sans-serif';
      this.combatHits.push({ x: s.x, y, combat: c });
    }
  }

  combatAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const x = clientX - r.left; const y = clientY - r.top;
    return (this.combatHits ?? []).find((h) => Math.hypot(h.x - x, h.y - y) <= 12)?.combat ?? null;
  }

  provinceAt(clientX, clientY) {
    if (!this.pixelProvince) return -1;
    const r = this.canvas.getBoundingClientRect();
    const mx = Math.floor((clientX - r.left - this.view.ox) / this.view.scale);
    const my = Math.floor((clientY - r.top - this.view.oy) / this.view.scale);
    if (mx < 0 || my < 0 || mx >= this.width || my >= this.height) return -1;
    return this.pixelProvince[my * this.width + mx];
  }

  zoomAt(factor, clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const sx = clientX - r.left;
    const sy = clientY - r.top;
    const next = Math.min(40, Math.max(0.2, this.view.scale * factor));
    const k = next / this.view.scale;
    this.view = { scale: next, ox: sx - (sx - this.view.ox) * k, oy: sy - (sy - this.view.oy) * k };
    this.draw();
  }

  pan(dx, dy) {
    this.view.ox += dx;
    this.view.oy += dy;
    this.draw();
  }

  bindInput() {
    const c = this.canvas;
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });

    let dragDist = 0;
    let pinchDist = null;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragDist = 0;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    c.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) {
        const idx = this.provinceAt(e.clientX, e.clientY);
        if (idx !== this.hoverIndex) this.hoverIndex = idx;
        this.onHover(idx >= 0 ? this.provinces[idx] : null, e.clientX, e.clientY);
        return;
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2 && pinchDist) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomAt(d / pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinchDist = d;
        dragDist = Infinity;
        return;
      }
      dragDist += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
      this.pan(e.clientX - prev.x, e.clientY - prev.y);
      this.onHover(null);
    });
    const end = (e) => {
      const wasClick = this.pointers.size === 1 && dragDist < 5 && e.type === 'pointerup' && e.button === 0;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) pinchDist = null;
      if (wasClick) {
        const combat = this.combatAt(e.clientX, e.clientY);
        if (combat) { this.onCombatClick(combat); return; }
        const idx = this.provinceAt(e.clientX, e.clientY);
        this.selectedIndex = idx;
        this.renderHighlight();
        this.onSelect(idx >= 0 ? this.provinces[idx] : null);
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const idx = this.provinceAt(e.clientX, e.clientY);
      if (idx >= 0) this.onContextMenu(this.provinces[idx], e.clientX, e.clientY);
    });
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => { if (!this.pointers.size) this.onHover(null); });
    c.addEventListener('keydown', (e) => {
      const step = 60;
      const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (moves[e.key]) { e.preventDefault(); this.pan(...moves[e.key]); }
    });
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.canvas.remove();
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image introuvable : ${url}`));
    img.src = url;
  });
}
