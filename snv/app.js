(function () {
  const $ = id => document.getElementById(id);
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fbad0);
  scene.fog = new THREE.Fog(0x9fbad0, 1500, 9000);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 30000);
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x6b6b55, 0.9));
  const sun = new THREE.DirectionalLight(0xfff1dd, 0.95);
  sun.position.set(-3000, 5000, 2000);
  scene.add(sun);
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495; controls.maxDistance = 16000; controls.minDistance = 3;
  function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();

  let IDX, HX, HY, ZR, T = 1000;
  const tiles = new Map();           // name -> stav dlaždice
  const LODD = [450, 1800, 5000, 1e9];
  let detail = 1, walk = false, yaw = 0, pitch = 0, keys = {}, drag = null;
  const EYE = 1.7;
  let showObj = true, showTree = true;
  const loaderPNG = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(url)); i.src = url; });
  const texCache = new Map();
  const TL = new THREE.TextureLoader();
  const maxA = 8;
  function tex(url, srgb) {
    return new Promise((res, rej) => TL.load(url, t => { t.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding; t.anisotropy = maxA; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; res(t); }, undefined, () => rej(new Error(url))));
  }
  function pixels(img) { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; }

  // ------------------------------------------------------------- terén
  async function loadHeights(t, k) {
    if (t.heights[k]) return t.heights[k];
    const img = await loaderPNG(`tiles/${t.name}/h${k}.png`);
    const p = pixels(img), n = img.width * img.height, H = new Float32Array(n), sc = ZR / 65535;
    for (let i = 0; i < n; i++) H[i] = p[i * 4 + 2] > 128 ? ((p[i * 4] << 8) | p[i * 4 + 1]) * sc : NaN;
    t.heights[k] = { H, w: img.width, h: img.height };
    return t.heights[k];
  }
  function buildTerrain(t, k, hd, texture) {
    const s = t.lods[k].stride, w = hd.w, h = hd.h, H = hd.H;
    const x0 = t.c0 - HX, z0 = t.r0 - HY;
    const nv = w * h;
    // okrajové "sukne" proti trhlinám medzi detailmi
    const skirt = k === 0 ? 3 : 14;
    const skv = 2 * (w + h);
    const pos = new Float32Array((nv + skv) * 3), uv = new Float32Array((nv + skv) * 2), nor = new Float32Array((nv + skv) * 3);
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
      const q = i * w + j, y = H[q];
      pos[q * 3] = x0 + j * s; pos[q * 3 + 1] = y === y ? y : 0; pos[q * 3 + 2] = z0 + i * s;
      uv[q * 2] = (j * s + 0.5) / 1001; uv[q * 2 + 1] = 1 - (i * s + 0.5) / 1001;
      const hc = y === y ? y : 0, hl = j > 0 && H[q - 1] === H[q - 1] ? H[q - 1] : hc, hr = j < w - 1 && H[q + 1] === H[q + 1] ? H[q + 1] : hc,
        hu = i > 0 && H[q - w] === H[q - w] ? H[q - w] : hc, hd2 = i < h - 1 && H[q + w] === H[q + w] ? H[q + w] : hc;
      const nx = (hl - hr) / (2 * s), nz = (hu - hd2) / (2 * s), l = Math.hypot(nx, 1, nz);
      nor[q * 3] = nx / l; nor[q * 3 + 1] = 1 / l; nor[q * 3 + 2] = nz / l;
    }
    const idx = [];
    for (let i = 0; i < h - 1; i++) for (let j = 0; j < w - 1; j++) {
      const a = i * w + j, b = a + 1, c = a + w, d = c + 1;
      if (H[a] === H[a] && H[b] === H[b] && H[c] === H[c] && H[d] === H[d]) idx.push(a, c, b, b, c, d);
    }
    // sukne: 4 okraje
    let sv = nv;
    const edge = (list) => { // list = indexy vrcholov po okraji v poradí
      const base = sv;
      for (let m = 0; m < list.length; m++) {
        const q = list[m]; pos[sv * 3] = pos[q * 3]; pos[sv * 3 + 1] = pos[q * 3 + 1] - skirt; pos[sv * 3 + 2] = pos[q * 3 + 2];
        uv[sv * 2] = uv[q * 2]; uv[sv * 2 + 1] = uv[q * 2 + 1]; nor[sv * 3] = nor[q * 3]; nor[sv * 3 + 1] = nor[q * 3 + 1]; nor[sv * 3 + 2] = nor[q * 3 + 2]; sv++;
      }
      for (let m = 0; m < list.length - 1; m++) {
        const a = list[m], b = list[m + 1];
        if (H[a] === H[a] && H[b] === H[b]) idx.push(a, base + m, b, b, base + m, base + m + 1);
      }
    };
    const top = [], bot = [], lef = [], rig = [];
    for (let j = 0; j < w; j++) { top.push(j); bot.push((h - 1) * w + j); }
    for (let i = 0; i < h; i++) { lef.push(i * w); rig.push(i * w + w - 1); }
    edge(top); edge(bot.slice().reverse()); edge(lef.slice().reverse()); edge(rig);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: texture }));
    return m;
  }
  function disposeMesh(m) { if (!m) return; scene.remove(m); m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); }

  async function setLOD(t, k) {
    if (t.busy || t.lod === k) return;
    t.busy = true;
    try {
      const hd = await loadHeights(t, k);
      const texture = await tex(`tiles/${t.name}/${k === 0 ? 'tex.jpg' : 'tex_lo.jpg'}`, true);
      const m = buildTerrain(t, k, hd, texture);
      scene.add(m);
      disposeMesh(t.mesh); t.mesh = m; t.lod = k;
      // uvoľni pamäť výšok vyšších detailov, ktoré už nepotrebujeme
      for (let q = 0; q < t.heights.length; q++) if (q !== k && q !== 3 && t.heights[q] && Math.abs(q - k) > 1) t.heights[q] = null;
    } catch (e) { console.warn('terén', t.name, e.message); }
    t.busy = false;
  }

  // ------------------------------------------------------------- objekty (GLB)
  const dl = new THREE.DRACOLoader(); dl.setDecoderPath('lib/draco/'); dl.setDecoderConfig({ type: 'wasm' });
  const gl = new THREE.GLTFLoader(); gl.setDRACOLoader(dl);
  const DEFS = { Budova_Strecha: ['RoofNeutral', true, [1, 1, 1]], Budova_Stena: ['PaintedPlaster017', true, [1, 1, 1]], Cesta_Asfalt: ['Asphalt031', true, [.5, .5, .52]], Cesta_Makadam: ['Ground081', false, [1, 1, 1]], Chodnik: ['PavingStones138', false, [1, 1, 1]], Beton: ['Concrete034', false, [1, 1, 1]], Trat: ['Trat', false, [.9, .9, .9]] };
  const SPR = { Okno: 'okno.png', Dvere: 'dvere.png' };
  const mtex = new Map();
  function mt(f, srgb) { if (!mtex.has(f)) { const t = TL.load('tex/' + f); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxA; if (srgb) t.encoding = THREE.sRGBEncoding; mtex.set(f, t); } return mtex.get(f); }
  function styleMaterials(root) {
    root.traverse(o => {
      if (!o.isMesh) return; const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(m => {
        if (/Kolajnice/i.test(m.name)) m.side = THREE.DoubleSide;
        if (/^Znacenie/i.test(m.name)) { m.polygonOffset = true; m.polygonOffsetFactor = -3; m.polygonOffsetUnits = -3; m.side = THREE.DoubleSide; }
        m.metalness = 0; m.roughness = Math.max(m.roughness ?? 1, .7); if (/Voda/i.test(m.name)) m.roughness = .15;
        const sk = Object.keys(SPR).find(k => m.name.startsWith(k));
        if (sk && !m.userData.s) { m.userData.s = 1; m.map = mt(SPR[sk], true); m.alphaTest = .5; m.color.setRGB(1, 1, 1); m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; m.needsUpdate = true; }
        const k = Object.keys(DEFS).find(k => m.name.startsWith(k));
        if (k && !m.userData.s) { m.userData.s = 1; const [id, nrm, c] = DEFS[k]; m.map = mt(id + '_Color.jpg', true); if (nrm) { m.normalMap = mt(id + '_NormalGL.jpg', false); m.normalScale.set(.8, .8); } m.color.setRGB(c[0], c[1], c[2]); m.needsUpdate = true; }
      });
    });
  }
  function fixColors(root) {   // Blender exportuje farby do COLOR_1 (COLOR_0 je biele) -> pouzi COLOR_1
    root.traverse(o => { if (o.isMesh && o.geometry.attributes.color_1) { o.geometry.setAttribute('color', o.geometry.attributes.color_1); o.geometry.deleteAttribute('color_1'); } });
  }
  async function loadGLB(url) {
    const r = await fetch(url); if (!r.ok) return null; const buf = await r.arrayBuffer();
    return new Promise((res, rej) => gl.parse(buf, '', g => { fixColors(g.scene); res(g.scene); }, rej));
  }
  async function setObjects(t, want) {
    if (t.objBusy) return; t.objBusy = true;
    try {
      if (want && t.obj === null) { const s = await loadGLB(`tiles/${t.name}/objekty.glb`); if (s) { styleMaterials(s); s.visible = showObj; t.obj = s; scene.add(s); } else t.obj = false; }
      else if (!want && t.obj) { disposeTree(t.obj); t.obj = null; }
    } catch (e) { console.warn('objekty', t.name, e.message); t.obj = false; }
    t.objBusy = false;
  }
  async function setTrees(t, want) {
    if (t.trBusy) return; t.trBusy = true;
    try {
      if (want && t.tr === null) { const s = await loadGLB(`tiles/${t.name}/stromy.glb`); if (s) { s.visible = showTree; t.tr = s; scene.add(s); } else t.tr = false; }
      else if (!want && t.tr) { disposeTree(t.tr); t.tr = null; }
    } catch (e) { t.tr = false; }
    t.trBusy = false;
  }
  function disposeTree(o) { scene.remove(o); o.traverse(c => { if (c.isMesh) { c.geometry.dispose(); } }); }

  // ------------------------------------------------------------- výška terénu (pre chôdzu)
  function tileAt(x, z) { const col = Math.floor(x + HX), row = Math.floor(z + HY); return tiles.get(String(Math.floor(row / T)).padStart(2, '0') + '_' + String(Math.floor(col / T)).padStart(2, '0')); }
  function heightAt(x, z) {
    const t = tileAt(x, z); if (!t) return NaN;
    for (let k = 0; k < 4; k++) {
      const hd = t.heights[k]; if (!hd) continue;
      const s = t.lods[k].stride, fx = (x - (t.c0 - HX)) / s, fz = (z - (t.r0 - HY)) / s;
      if (fx < 0 || fz < 0 || fx >= hd.w - 1 || fz >= hd.h - 1) continue;
      const j = fx | 0, i = fz | 0, a = fx - j, b = fz - i, q = i * hd.w + j, H = hd.H;
      const v = [H[q], H[q + 1], H[q + hd.w], H[q + hd.w + 1]]; if (v.some(e => e !== e)) return NaN;
      return v[0] * (1 - a) * (1 - b) + v[1] * a * (1 - b) + v[2] * (1 - a) * b + v[3] * a * b;
    }
    return NaN;
  }
  function pick(ev) {
    const r = canvas.getBoundingClientRect(), ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, camera); const o = rc.ray.origin, d = rc.ray.direction; let t = 0, prev = 0;
    for (let i = 0; i < 6000; i++) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t, h = heightAt(x, z);
      if (h === h && y < h) { let a = prev, b = t; for (let k = 0; k < 20; k++) { const m = (a + b) / 2, hh = heightAt(o.x + d.x * m, o.z + d.z * m); if (hh === hh && o.y + d.y * m < hh) b = m; else a = m; } return { x: o.x + d.x * b, z: o.z + d.z * b }; }
      prev = t; t += Math.max(1.5, t * 0.004); if (t > 20000) break;
    }
    return null;
  }

  // ------------------------------------------------------------- režimy
  function enterWalk(x, z, yw) {
    const y = heightAt(x, z); if (y !== y) return false;
    walk = true; controls.enabled = false; camera.position.set(x, y + EYE, z); yaw = yw === undefined ? yaw : yw; pitch = -0.05; applyLook();
    $('badge').style.display = 'block'; $('btnWalk').textContent = 'Naspäť do mapy'; scene.fog.near = 400; scene.fog.far = 3000; return true;
  }
  function exitWalk() {
    if (!walk) return; walk = false; controls.enabled = true; const p = camera.position.clone();
    camera.position.set(p.x - 150, p.y + 120, p.z + 200); controls.target.set(p.x, p.y - EYE, p.z); controls.update(); $('badge').style.display = 'none'; $('btnWalk').textContent = 'Prejsť pešo'; scene.fog.near = 1500; scene.fog.far = 9000;
  }
  function applyLook() { camera.rotation.order = 'YXZ'; camera.rotation.set(pitch, yaw, 0); }
  function flyTo(x, z, dist) {
    if (walk) exitWalk();
    const y = heightAt(x, z); const gy = y === y ? y : 400;
    controls.target.set(x, gy, z); camera.position.set(x - dist * 0.6, gy + dist * 0.8, z + dist * 0.9); controls.update();
  }
  canvas.addEventListener('dblclick', ev => { if (walk) return; const p = pick(ev); if (p) enterWalk(p.x, p.z); });
  canvas.addEventListener('pointerdown', ev => { if (walk) { drag = { x: ev.clientX, y: ev.clientY }; canvas.setPointerCapture(ev.pointerId); } });
  canvas.addEventListener('pointermove', ev => { if (walk && drag) { yaw -= (ev.clientX - drag.x) * 0.004; pitch = Math.max(-1.3, Math.min(1.3, pitch - (ev.clientY - drag.y) * 0.004)); drag = { x: ev.clientX, y: ev.clientY }; applyLook(); } });
  canvas.addEventListener('pointerup', () => { drag = null; });
  addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Escape') exitWalk(); });
  addEventListener('keyup', e => { keys[e.code] = false; });
  $('btnWalk').addEventListener('click', () => {
    if (walk) { exitWalk(); return; }
    const p = pick({ clientX: innerWidth / 2, clientY: innerHeight / 2 }) || { x: controls.target.x, z: controls.target.z };
    const dir = new THREE.Vector3().subVectors(controls.target, camera.position); const yw = Math.atan2(-dir.x, -dir.z);
    enterWalk(p.x, p.z, yw);
  });
  $('btnHome').addEventListener('click', () => { if (walk) exitWalk(); camera.position.set(-1500, 6500, 8500); controls.target.set(600, 500, -1200); controls.update(); });
  $('btnMin').addEventListener('click', () => { const p = $('panel'); p.classList.toggle('min'); $('btnMin').textContent = p.classList.contains('min') ? '☰' : '–'; });
  $('lObj').addEventListener('change', e => { showObj = e.target.checked; tiles.forEach(t => { if (t.obj) t.obj.visible = showObj; }); });
  $('lTree').addEventListener('change', e => { showTree = e.target.checked; tiles.forEach(t => { if (t.tr) t.tr.visible = showTree; }); });
  $('rng').addEventListener('input', e => { detail = parseFloat(e.target.value); $('rngv').textContent = detail.toFixed(1) + '×'; });
  const ov = $('ov');
  ov.addEventListener('click', ev => {
    const r = ov.getBoundingClientRect(), fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height;
    const col = fx * ov.naturalWidth * 6, row = fy * ov.naturalHeight * 6; flyTo(col - HX, row - HY, 700);
  });

  // ------------------------------------------------------------- aktualizácia dlaždíc
  function rectDist(t, cx, cz) {
    const x0 = t.c0 - HX, z0 = t.r0 - HY, x1 = x0 + T, z1 = z0 + T;
    return Math.hypot(Math.max(x0 - cx, 0, cx - x1), Math.max(z0 - cz, 0, cz - z1));
  }
  let lastUpd = 0;
  function update(now) {
    if (now - lastUpd < 400) return; lastUpd = now;
    const cx = camera.position.x, cz = camera.position.z, gy = camera.position.y; let nT = 0, nO = 0, nTr = 0, nL0 = 0;
    const alt = Math.max(0, gy - 300) * 0.5;      // vysoko = menej detailu
    tiles.forEach(t => {
      const d = rectDist(t, cx, cz) + alt * 0.0;
      const D = LODD.map(v => v * detail);
      const k = d < D[0] ? 0 : d < D[1] ? 1 : d < D[2] ? 2 : 3;
      setLOD(t, k);
      setObjects(t, d < 900 * detail || (t.obj && d < 1300 * detail));
      setTrees(t, d < 480 * detail || (t.tr && d < 700 * detail));
      if (t.mesh) nT++; if (t.obj) nO++; if (t.tr) nTr++; if (t.lod === 0) nL0++;
    });
    $('stat').textContent = `dlaždice: ${nT}/${tiles.size} (detail 1 m: ${nL0}) · budovy: ${nO} · stromy: ${nTr}\nkamera: ${(camera.position.x).toFixed(0)}, ${(camera.position.y).toFixed(0)}, ${(camera.position.z).toFixed(0)}`;
    const dot = $('dot'), r = ov.getBoundingClientRect(); dot.style.left = ((camera.position.x + HX) / 6 / ov.naturalWidth * 100) + '%'; dot.style.top = ((camera.position.z + HY) / 6 / ov.naturalHeight * 100) + '%';
  }
  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (walk) {
      const sp = (keys.ShiftLeft || keys.ShiftRight ? 12 : 3.5) * dt; let f = 0, s = 0;
      if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1; if (keys.KeyD || keys.ArrowRight) s += 1; if (keys.KeyA || keys.ArrowLeft) s -= 1;
      if (f || s) { const nx = camera.position.x + (-Math.sin(yaw) * f + Math.cos(yaw) * s) * sp, nz = camera.position.z + (-Math.cos(yaw) * f - Math.sin(yaw) * s) * sp, h = heightAt(nx, nz); if (h === h) { camera.position.x = nx; camera.position.z = nz; } }
      const gy = heightAt(camera.position.x, camera.position.z); if (gy === gy) camera.position.y += ((gy + EYE) - camera.position.y) * Math.min(1, dt * 12);
    } else controls.update();
    update(now); renderer.render(scene, camera);
  }
  (async function init() {
    try {
      IDX = await (await fetch('index.json')).json(); HX = (IDX.C - 1) / 2; HY = (IDX.R - 1) / 2; ZR = IDX.ZMAX - IDX.ZMIN; T = IDX.T;
      IDX.tiles.forEach(i => tiles.set(i.name, Object.assign({}, i, { lod: -1, heights: [null, null, null, null], mesh: null, obj: null, tr: null })));
      $('lmsg').textContent = 'Načítavam hrubý terén celého mesta…';
      const all = [...tiles.values()]; await Promise.all(all.map(t => setLOD(t, 3)));
      // štart: centrum mesta (dlaždica 3_6)
      flyTo(821, -1709, 1400); window.__app = { tiles, scene, camera, controls, heightAt };
      $('loader').style.display = 'none'; requestAnimationFrame(loop);
    } catch (e) { $('lmsg').textContent = 'Chyba: ' + e.message; console.error(e); }
  })();
})();
