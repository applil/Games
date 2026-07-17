(() => {
  "use strict";

  const DEFAULT_PROFILE = {
    version: 1,
    id: "dark-architecture",
    camera: { fov: 72, height: 1.64, moveMs: 260, turnMs: 220 },
    geometry: { cellSize: 4.0, wallHeight: 3.25, stripWidth: 0.032 },
    materials: {
      wallColor: "#18130f",
      floorColor: "#211b16",
      wallRoughness: 0.86,
      floorRoughness: 0.52,
      floorMetallic: 0.06
    },
    lighting: {
      ledColor: "#ffd0a4",
      goalColor: "#9fe8ff",
      ledIntensity: 4.6,
      ambientIntensity: 0.18,
      playerLightIntensity: 2.9,
      playerLightRange: 14
    },
    post: {
      exposure: 1.16,
      contrast: 1.18,
      bloom: 0.72,
      bloomThreshold: 0.72,
      fogDensity: 0.011,
      vignette: 0.22
    }
  };

  const BASIC_MAX_SIZE = 15;
  const dirs = [
    { x: 0, z: -1, name: "north" },
    { x: 1, z: 0, name: "east" },
    { x: 0, z: 1, name: "south" },
    { x: -1, z: 0, name: "west" }
  ];

  const el = (id) => document.getElementById(id);
  const canvas = el("renderCanvas");
  const mapCanvas = el("mapCanvas");
  const mapCtx = mapCanvas.getContext("2d");

  let profile = loadProfile();
  let engine;
  let scene;
  let camera;
  let pipeline;
  let ambientLight;
  let playerLight;
  let wallMaterial;
  let wallCoreMaterial;
  let floorMaterial;
  let ledMaterial;
  let goalMaterial;
  let mazeRoot;
  let goalRoot;
  let mazeData;
  let player = { x: 1, z: 1, dir: 2 };
  let level = 1;
  let steps = 0;
  let startedAt = performance.now();
  let pausedAt = 0;
  let action = null;
  let complete = false;
  let mapVisible = false;
  let toastTimer = null;

  const controls = [
    { path: "camera.fov", label: "Field of view", min: 48, max: 96, step: 1, unit: "°" },
    { path: "camera.moveMs", label: "Move duration", min: 80, max: 600, step: 10, unit: "ms" },
    { path: "camera.turnMs", label: "Turn duration", min: 80, max: 600, step: 10, unit: "ms" },
    { path: "post.exposure", label: "Exposure", min: 0.55, max: 2.2, step: 0.01, digits: 2 },
    { path: "post.contrast", label: "Contrast", min: 0.7, max: 1.8, step: 0.01, digits: 2 },
    { path: "post.bloom", label: "Bloom", min: 0, max: 1.6, step: 0.01, digits: 2 },
    { path: "post.bloomThreshold", label: "Bloom threshold", min: 0, max: 1.5, step: 0.01, digits: 2 },
    { path: "post.fogDensity", label: "Fog density", min: 0, max: 0.04, step: 0.0005, digits: 4 },
    { path: "post.vignette", label: "Vignette", min: 0, max: 0.8, step: 0.01, digits: 2 },
    { path: "lighting.ledIntensity", label: "LED intensity", min: 0, max: 10, step: 0.1, digits: 1 },
    { path: "lighting.ambientIntensity", label: "Ambient", min: 0, max: 1, step: 0.01, digits: 2 },
    { path: "lighting.playerLightIntensity", label: "Player light", min: 0, max: 8, step: 0.1, digits: 1 },
    { path: "lighting.playerLightRange", label: "Light range", min: 4, max: 30, step: 0.5, digits: 1 },
    { path: "materials.wallRoughness", label: "Wall roughness", min: 0, max: 1, step: 0.01, digits: 2 },
    { path: "materials.floorRoughness", label: "Floor roughness", min: 0, max: 1, step: 0.01, digits: 2 },
    { path: "materials.floorMetallic", label: "Floor metallic", min: 0, max: 0.5, step: 0.01, digits: 2 }
  ];

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function loadProfile() {
    try {
      const saved = localStorage.getItem("basic3dmaze.look");
      return saved ? mergeDeep(clone(DEFAULT_PROFILE), JSON.parse(saved)) : clone(DEFAULT_PROFILE);
    } catch (_) {
      return clone(DEFAULT_PROFILE);
    }
  }
  function mergeDeep(target, source) {
    for (const [key, value] of Object.entries(source || {})) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        target[key] = mergeDeep(target[key] || {}, value);
      } else {
        target[key] = value;
      }
    }
    return target;
  }
  function getPath(obj, path) { return path.split(".").reduce((o, k) => o[k], obj); }
  function setPath(obj, path, value) {
    const parts = path.split(".");
    const key = parts.pop();
    const parent = parts.reduce((o, k) => o[k], obj);
    parent[key] = value;
  }
  function saveProfile() {
    localStorage.setItem("basic3dmaze.look", JSON.stringify(profile));
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function() {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // 元のBASICの「棒倒し法」を、同じ順序・同じ方向制限で再実装。
  function generateBasicMaze(size, seed) {
    const W = Math.max(7, Math.min(BASIC_MAX_SIZE, size | 1));
    const rows = new Array(W).fill(0);
    const rightBit = 1 << (W - 1);
    const fullRow = (rightBit << 1) - 1;
    const rng = mulberry32(seed >>> 0 || 1);

    for (let y = 0; y < W; y++) rows[y] = rightBit + 1;
    rows[0] = fullRow;
    rows[W - 1] = fullRow;

    for (let x = 2; x <= W - 3; x += 2) {
      for (let y = 2; y <= W - 3; y += 2) {
        rows[y] |= 1 << x; // 柱
        while (true) {
          // BASIC: first pillar row can use 0..3, later rows use 1..3 (no upward fall)
          const k = y > 2 ? 1 + Math.floor(rng() * 3) : Math.floor(rng() * 4);
          let u = x;
          let v = y;
          if (k === 0) v -= 1;
          if (k === 1) v += 1;
          if (k === 2) u -= 1;
          if (k === 3) u += 1;
          if (((rows[v] >> u) & 1) === 0) {
            rows[v] |= 1 << u;
            break;
          }
        }
      }
    }

    const grid = [];
    for (let y = 0; y < W; y++) {
      let line = "";
      for (let x = 0; x < W; x++) line += ((rows[y] >> x) & 1) ? "#" : ".";
      grid.push(line);
    }
    grid[1] = replaceAt(grid[1], 1, "S");
    grid[W - 2] = replaceAt(grid[W - 2], W - 2, "G");

    return {
      version: 1,
      id: `basic-stick-${W}-${seed}`,
      algorithm: "basic-stick-falling-v1",
      source: "BASIC 3D MAZE compatible layout",
      size: W,
      seed: seed >>> 0,
      cellSize: profile.geometry.cellSize,
      wallHeight: profile.geometry.wallHeight,
      start: { x: 1, z: 1, direction: "south" },
      goal: { x: W - 2, z: W - 2 },
      grid
    };
  }

  function replaceAt(text, index, char) { return text.slice(0, index) + char + text.slice(index + 1); }
  function isWall(x, z) {
    if (!mazeData || z < 0 || z >= mazeData.size || x < 0 || x >= mazeData.size) return true;
    return mazeData.grid[z][x] === "#";
  }

  async function init() {
    if (!window.BABYLON) {
      document.body.innerHTML = '<div style="padding:40px;color:white;font-family:sans-serif">Babylon.jsを読み込めませんでした。インターネット接続を確認してください。</div>';
      return;
    }

    setupPanel();
    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true });
    scene = createScene();
    setupEvents();

    const initialSeed = (Date.now() & 0x7fffffff) || 1;
    el("mazeSeed").value = String(initialSeed);
    el("mazeSize").value = "7";
    rebuildMaze(7, initialSeed, true);

    engine.runRenderLoop(() => {
      updateAction(performance.now());
      updateTimer();
      if (goalRoot) goalRoot.rotation.y += engine.getDeltaTime() * 0.00012;
      scene.render();
    });
    window.addEventListener("resize", () => engine.resize());
    canvas.focus();
  }

  function createScene() {
    const s = new BABYLON.Scene(engine);
    s.clearColor = BABYLON.Color4.FromHexString("#050403ff");
    s.ambientColor = BABYLON.Color3.FromHexString("#100c09");
    s.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    s.fogColor = BABYLON.Color3.FromHexString("#050403");

    camera = new BABYLON.UniversalCamera("playerCamera", new BABYLON.Vector3(0, profile.camera.height, 0), s);
    camera.minZ = 0.05;
    camera.maxZ = 220;
    camera.fov = BABYLON.Tools.ToRadians(profile.camera.fov);
    camera.inputs.clear();

    ambientLight = new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0, 1, 0), s);
    ambientLight.diffuse = BABYLON.Color3.FromHexString("#ffe3c8");
    ambientLight.groundColor = BABYLON.Color3.FromHexString("#271a12");

    playerLight = new BABYLON.PointLight("playerLight", camera.position.clone(), s);
    playerLight.parent = camera;
    playerLight.position = new BABYLON.Vector3(0, 0.18, 0.3);
    playerLight.diffuse = BABYLON.Color3.FromHexString("#ffd7b6");
    playerLight.specular = BABYLON.Color3.FromHexString("#ffe8d5");

    pipeline = new BABYLON.DefaultRenderingPipeline("cinematic", true, s, [camera]);
    pipeline.samples = 4;
    pipeline.fxaaEnabled = true;
    pipeline.bloomEnabled = true;
    pipeline.bloomKernel = 72;

    s.imageProcessingConfiguration.toneMappingEnabled = true;
    s.imageProcessingConfiguration.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    s.imageProcessingConfiguration.vignetteEnabled = true;
    s.imageProcessingConfiguration.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
    s.imageProcessingConfiguration.vignetteColor = new BABYLON.Color4(0.02, 0.015, 0.01, 1);

    createMaterials(s);
    applyProfile();
    return s;
  }

  function forceOpaqueMaterial(material) {
    // DynamicTextureのアルファやBabylon.jsの自動判定に左右されず、
    // 壁・床を必ず不透明として深度バッファへ書き込む。
    material.alpha = 1;
    // 両面を描画する。カメラが壁面すれすれに来ても裏面消失で向こうが見えないようにする。
    material.backFaceCulling = false;
    material.disableDepthWrite = false;
    material.forceDepthWrite = true;
    material.alphaMode = BABYLON.Engine.ALPHA_DISABLE;
    if (BABYLON.PBRMaterial && material instanceof BABYLON.PBRMaterial) {
      material.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
      material.useAlphaFromAlbedoTexture = false;
      material.forceAlphaTest = false;
    }
    // Babylon側の自動判定も明示的に無効化。
    material.needAlphaBlending = () => false;
    material.needAlphaTesting = () => false;
  }

  function createMaterials(s) {
    wallMaterial = new BABYLON.PBRMaterial("wallMaterial", s);
    wallMaterial.albedoTexture = createWallTexture(s);
    wallMaterial.albedoTexture.hasAlpha = false;
    wallMaterial.metallic = 0.02;
    wallMaterial.environmentIntensity = 0.25;
    forceOpaqueMaterial(wallMaterial);

    // 各 # セルの内部に入れる完全不透明の芯。
    // 表面マテリアルやGPUの描画順に何が起きても、壁の向こう側が透けない。
    wallCoreMaterial = new BABYLON.StandardMaterial("wallCoreMaterial", s);
    wallCoreMaterial.diffuseColor = BABYLON.Color3.FromHexString("#100d0a");
    wallCoreMaterial.specularColor = BABYLON.Color3.Black();
    wallCoreMaterial.emissiveColor = BABYLON.Color3.FromHexString("#030201");
    wallCoreMaterial.alpha = 1;
    wallCoreMaterial.backFaceCulling = false;
    wallCoreMaterial.disableDepthWrite = false;
    wallCoreMaterial.forceDepthWrite = true;
    wallCoreMaterial.alphaMode = BABYLON.Engine.ALPHA_DISABLE;
    wallCoreMaterial.needAlphaBlending = () => false;
    wallCoreMaterial.needAlphaTesting = () => false;

    floorMaterial = new BABYLON.PBRMaterial("floorMaterial", s);
    floorMaterial.albedoTexture = createFloorTexture(s);
    floorMaterial.albedoTexture.hasAlpha = false;
    floorMaterial.environmentIntensity = 0.35;
    forceOpaqueMaterial(floorMaterial);

    ledMaterial = new BABYLON.StandardMaterial("ledMaterial", s);
    ledMaterial.disableLighting = true;

    goalMaterial = new BABYLON.StandardMaterial("goalMaterial", s);
    goalMaterial.disableLighting = true;
    goalMaterial.alpha = 0.92;
  }

  function createWallTexture(s) {
    const tex = new BABYLON.DynamicTexture("wallTexture", { width: 512, height: 512 }, s, false);
    const ctx = tex.getContext();
    ctx.fillStyle = "#30231b";
    ctx.fillRect(0, 0, 512, 512);
    let seed = 127;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let x = 0; x < 512; x += 3) {
      const a = 0.025 + rnd() * 0.055;
      ctx.fillStyle = `rgba(255,225,200,${a})`;
      ctx.fillRect(x, 0, 1, 512);
    }
    for (let i = 0; i < 2600; i++) {
      const x = Math.floor(rnd() * 512);
      const y = Math.floor(rnd() * 512);
      const v = Math.floor(80 + rnd() * 90);
      ctx.fillStyle = `rgba(${v},${Math.floor(v * .72)},${Math.floor(v * .55)},${.02 + rnd() * .025})`;
      ctx.fillRect(x, y, 1, 8 + Math.floor(rnd() * 35));
    }
    tex.update(false);
    tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    tex.uScale = 1.4;
    tex.vScale = 1.0;
    return tex;
  }

  function createFloorTexture(s) {
    const tex = new BABYLON.DynamicTexture("floorTexture", { width: 512, height: 512 }, s, false);
    const ctx = tex.getContext();
    ctx.fillStyle = "#342921";
    ctx.fillRect(0, 0, 512, 512);
    let seed = 911;
    const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 13500; i++) {
      const x = Math.floor(rnd() * 512);
      const y = Math.floor(rnd() * 512);
      const c = Math.floor(95 + rnd() * 50);
      ctx.fillStyle = `rgba(${c},${Math.floor(c*.82)},${Math.floor(c*.68)},${.018 + rnd()*.03})`;
      ctx.fillRect(x, y, 1 + Math.floor(rnd()*2), 1 + Math.floor(rnd()*2));
    }
    ctx.strokeStyle = "rgba(10,8,7,.72)";
    ctx.lineWidth = 3;
    const tile = 128;
    for (let x = 0; x <= 512; x += tile) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
    for (let y = 0; y <= 512; y += tile) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
    ctx.strokeStyle = "rgba(255,235,215,.035)";
    ctx.lineWidth = 1;
    for (let x = 2; x <= 512; x += tile) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
    for (let y = 2; y <= 512; y += tile) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
    tex.update(false);
    tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    tex.uScale = 3.0;
    tex.vScale = 3.0;
    return tex;
  }

  function rebuildMaze(size, seed, resetLevelStats = false) {
    size = Number(size);
    if (size % 2 === 0) size += 1;
    seed = Math.max(1, Number(seed) || 1);
    mazeData = generateBasicMaze(size, seed);
    el("mazeSize").value = String(size);
    el("mazeSeed").value = String(seed);

    if (mazeRoot) mazeRoot.dispose(false, true);
    if (goalRoot) goalRoot.dispose(false, true);
    mazeRoot = new BABYLON.TransformNode("mazeRoot", scene);
    buildMazeMeshes();

    player = { x: mazeData.start.x, z: mazeData.start.z, dir: 2 };
    steps = 0;
    complete = false;
    action = null;
    if (resetLevelStats) level = Math.max(1, (size - 5) / 2);
    startedAt = performance.now();
    pausedAt = 0;
    el("messageOverlay").hidden = true;
    setCameraInstant();
    updateHud();
    drawMap();
    canvas.focus();
  }

  function buildMazeMeshes() {
    const W = mazeData.size;
    const cs = profile.geometry.cellSize;
    const h = profile.geometry.wallHeight;
    mazeData.cellSize = cs;
    mazeData.wallHeight = h;

    const span = W * cs;
    const floor = BABYLON.MeshBuilder.CreateGround("floor", { width: span, height: span, subdivisions: W }, scene);
    floor.material = floorMaterial;
    floor.parent = mazeRoot;

    const ceiling = BABYLON.MeshBuilder.CreateBox("ceiling", { width: span, height: 0.12, depth: span }, scene);
    ceiling.position.y = h + 0.06;
    ceiling.material = wallMaterial;
    ceiling.parent = mazeRoot;

    // 2Dマップの # ひとつにつき、3Dでもセル一杯の「固体ブロック」を1個置く。
    // 薄い壁面を通路境界に貼る方式にはしない。結合もしない。
    // これにより、横や斜めから見ても壁の内部・背後が見えない。
    let solidBlockCount = 0;
    for (let z = 0; z < W; z++) {
      for (let x = 0; x < W; x++) {
        if (!isWall(x, z)) continue;
        const p = cellToWorld(x, z);

        // 内部を埋める芯。セルよりごくわずかに小さく、表面の箱の完全な内側に収める。
        const core = BABYLON.MeshBuilder.CreateBox(`wall-core-${x}-${z}`, {
          width: cs - 0.04,
          height: h - 0.02,
          depth: cs - 0.04,
          updatable: false
        }, scene);
        core.position.set(p.x, h / 2, p.z);
        core.material = wallCoreMaterial;
        core.parent = mazeRoot;
        core.isPickable = false;
        core.renderingGroupId = 0;

        // テクスチャ付きの外殻も、セル全体を占める閉じた箱。
        const wall = BABYLON.MeshBuilder.CreateBox(`wall-block-${x}-${z}`, {
          width: cs,
          height: h,
          depth: cs,
          updatable: false
        }, scene);
        wall.position.set(p.x, h / 2, p.z);
        wall.material = wallMaterial;
        wall.parent = mazeRoot;
        wall.isPickable = false;
        wall.renderingGroupId = 0;
        wall.metadata = { solidBlock: true, gridX: x, gridZ: z };
        solidBlockCount++;
      }
    }
    mazeRoot.metadata = { solidBlockCount };

    const strips = [];
    const stripH = profile.geometry.stripWidth;
    const edge = cs / 2 - 0.018;
    const inset = cs * 0.96;
    for (let z = 0; z < W; z++) {
      for (let x = 0; x < W; x++) {
        if (isWall(x, z)) continue;
        const p = cellToWorld(x, z);
        const checks = [
          { dx: 0, dz: -1, axis: "x", px: p.x, pz: p.z - edge },
          { dx: 0, dz: 1, axis: "x", px: p.x, pz: p.z + edge },
          { dx: -1, dz: 0, axis: "z", px: p.x - edge, pz: p.z },
          { dx: 1, dz: 0, axis: "z", px: p.x + edge, pz: p.z }
        ];
        for (const c of checks) {
          if (!isWall(x + c.dx, z + c.dz)) continue;
          for (const y of [0.075, h - 0.075]) {
            const dimensions = c.axis === "x"
              ? { width: inset, height: stripH, depth: stripH }
              : { width: stripH, height: stripH, depth: inset };
            const strip = BABYLON.MeshBuilder.CreateBox("strip", dimensions, scene);
            strip.position.set(c.px, y, c.pz);
            strip.material = ledMaterial;
            strips.push(strip);
          }
        }
      }
    }
    const mergedStrips = BABYLON.Mesh.MergeMeshes(strips, true, true, undefined, false, true);
    if (mergedStrips) {
      mergedStrips.name = "architectural-light-strips";
      mergedStrips.material = ledMaterial;
      mergedStrips.parent = mazeRoot;
    }

    buildGoal();
  }

  function buildGoal() {
    const cs = profile.geometry.cellSize;
    const p = cellToWorld(mazeData.goal.x, mazeData.goal.z);
    goalRoot = new BABYLON.TransformNode("goalRoot", scene);
    goalRoot.position.set(p.x, 0.025, p.z);
    const side = cs * 0.52;
    const thick = 0.055;
    const y = 0.05;
    const pieces = [
      { w: side, d: thick, x: 0, z: -side/2 },
      { w: side, d: thick, x: 0, z: side/2 },
      { w: thick, d: side, x: -side/2, z: 0 },
      { w: thick, d: side, x: side/2, z: 0 }
    ];
    for (const q of pieces) {
      const m = BABYLON.MeshBuilder.CreateBox("goal-frame", { width: q.w, height: thick, depth: q.d }, scene);
      m.position.set(q.x, y, q.z);
      m.material = goalMaterial;
      m.parent = goalRoot;
    }
    const glowPlate = BABYLON.MeshBuilder.CreateCylinder("goal-core", { diameter: 0.28, height: 0.035, tessellation: 32 }, scene);
    glowPlate.position.y = 0.07;
    glowPlate.material = goalMaterial;
    glowPlate.parent = goalRoot;
  }

  function cellToWorld(x, z) {
    const offset = (mazeData.size - 1) / 2;
    return {
      x: (x - offset) * profile.geometry.cellSize,
      z: (z - offset) * profile.geometry.cellSize
    };
  }

  function dirYaw(dir) {
    return [Math.PI, Math.PI / 2, 0, -Math.PI / 2][dir & 3];
  }

  function setCameraInstant() {
    const p = cellToWorld(player.x, player.z);
    camera.position.set(p.x, profile.camera.height, p.z);
    camera.rotation.set(0, dirYaw(player.dir), 0);
  }

  function queueMove(sign) {
    if (action || complete || mapVisible) return;
    const d = dirs[player.dir];
    const tx = player.x + d.x * sign;
    const tz = player.z + d.z * sign;
    if (isWall(tx, tz)) {
      flashBlocked();
      return;
    }
    const from = camera.position.clone();
    const wp = cellToWorld(tx, tz);
    action = {
      type: "move",
      start: performance.now(),
      duration: profile.camera.moveMs,
      from,
      to: new BABYLON.Vector3(wp.x, profile.camera.height, wp.z),
      targetGrid: { x: tx, z: tz }
    };
  }

  function queueTurn(delta) {
    if (action || complete || mapVisible) return;
    const targetDir = (player.dir + delta + 4) % 4;
    let fromYaw = camera.rotation.y;
    let toYaw = dirYaw(targetDir);
    while (toYaw - fromYaw > Math.PI) toYaw -= Math.PI * 2;
    while (toYaw - fromYaw < -Math.PI) toYaw += Math.PI * 2;
    action = {
      type: "turn",
      start: performance.now(),
      duration: profile.camera.turnMs,
      fromYaw,
      toYaw,
      targetDir
    };
  }

  function updateAction(now) {
    if (!action) return;
    const t = Math.min(1, (now - action.start) / action.duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    if (action.type === "move") {
      camera.position = BABYLON.Vector3.Lerp(action.from, action.to, eased);
    } else {
      camera.rotation.y = action.fromYaw + (action.toYaw - action.fromYaw) * eased;
    }
    if (t >= 1) {
      const done = action;
      action = null;
      if (done.type === "move") {
        camera.position.copyFrom(done.to);
        player.x = done.targetGrid.x;
        player.z = done.targetGrid.z;
        steps++;
        if (player.x === mazeData.goal.x && player.z === mazeData.goal.z) finishLevel();
      } else {
        player.dir = done.targetDir;
        camera.rotation.y = dirYaw(player.dir);
      }
      updateHud();
      if (mapVisible) drawMap();
    }
  }

  function flashBlocked() {
    canvas.animate([
      { filter: "brightness(1)" },
      { filter: "brightness(1.14) saturate(.78)" },
      { filter: "brightness(1)" }
    ], { duration: 130, easing: "ease-out" });
  }

  function finishLevel() {
    complete = true;
    pausedAt = performance.now();
    const seconds = (pausedAt - startedAt) / 1000;
    el("messageBody").textContent = `${steps} steps / ${formatTime(seconds * 1000)}`;
    if (mazeData.size < BASIC_MAX_SIZE) {
      el("messageKicker").textContent = "LEVEL COMPLETE";
      el("messageTitle").textContent = "NEXT!";
      el("nextButton").textContent = "NEXT LEVEL";
    } else {
      el("messageKicker").textContent = "ALL MAZES COMPLETE";
      el("messageTitle").textContent = "CLEAR!";
      el("nextButton").textContent = "PLAY AGAIN";
    }
    el("messageOverlay").hidden = false;
  }

  function nextLevel() {
    const nextSize = mazeData.size < BASIC_MAX_SIZE ? mazeData.size + 2 : 7;
    level = (nextSize - 5) / 2;
    const seed = ((Date.now() ^ (nextSize * 2654435761)) >>> 0) || 1;
    rebuildMaze(nextSize, seed, false);
  }

  function updateHud() {
    el("levelValue").textContent = String(level);
    el("sizeValue").textContent = `${mazeData ? mazeData.size : 7}×${mazeData ? mazeData.size : 7}`;
    el("stepValue").textContent = String(steps);
  }

  function updateTimer() {
    if (!mazeData) return;
    const end = complete ? pausedAt : performance.now();
    el("timeValue").textContent = formatTime(end - startedAt);
  }

  function formatTime(ms) {
    const totalTenths = Math.max(0, Math.floor(ms / 100));
    const minutes = Math.floor(totalTenths / 600);
    const seconds = Math.floor((totalTenths % 600) / 10);
    const tenths = totalTenths % 10;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
  }

  function toggleMap(force) {
    mapVisible = typeof force === "boolean" ? force : !mapVisible;
    el("mapOverlay").hidden = !mapVisible;
    if (mapVisible) drawMap();
    else canvas.focus();
  }

  function drawMap() {
    if (!mazeData) return;
    const W = mazeData.size;
    const pad = 28;
    const cell = (mapCanvas.width - pad * 2) / W;
    mapCtx.fillStyle = "#0a0908";
    mapCtx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);

    for (let z = 0; z < W; z++) {
      for (let x = 0; x < W; x++) {
        const ch = mazeData.grid[z][x];
        mapCtx.fillStyle = ch === "#" ? "#352820" : "#151311";
        mapCtx.fillRect(pad + x * cell, pad + z * cell, cell - 1, cell - 1);
      }
    }

    const gx = pad + (mazeData.goal.x + .5) * cell;
    const gz = pad + (mazeData.goal.z + .5) * cell;
    mapCtx.fillStyle = profile.lighting.goalColor;
    mapCtx.beginPath();
    mapCtx.arc(gx, gz, Math.max(3, cell * .18), 0, Math.PI * 2);
    mapCtx.fill();

    const px = pad + (player.x + .5) * cell;
    const pz = pad + (player.z + .5) * cell;
    const angle = [ -Math.PI/2, 0, Math.PI/2, Math.PI ][player.dir];
    mapCtx.save();
    mapCtx.translate(px, pz);
    mapCtx.rotate(angle);
    mapCtx.fillStyle = "#fff1e5";
    mapCtx.beginPath();
    mapCtx.moveTo(cell * .26, 0);
    mapCtx.lineTo(-cell * .18, -cell * .18);
    mapCtx.lineTo(-cell * .12, 0);
    mapCtx.lineTo(-cell * .18, cell * .18);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  function setupPanel() {
    const host = el("tuningControls");
    const title = document.createElement("h2");
    title.textContent = "Visual / Motion";
    host.appendChild(title);
    for (const c of controls) {
      const row = document.createElement("div");
      row.className = "control-row";
      const label = document.createElement("label");
      label.textContent = c.label;
      const input = document.createElement("input");
      input.type = "range";
      input.min = c.min;
      input.max = c.max;
      input.step = c.step;
      input.value = getPath(profile, c.path);
      const output = document.createElement("output");
      const renderValue = () => {
        const value = Number(input.value);
        output.textContent = `${c.digits !== undefined ? value.toFixed(c.digits) : value}${c.unit || ""}`;
      };
      renderValue();
      input.addEventListener("input", () => {
        setPath(profile, c.path, Number(input.value));
        renderValue();
        applyProfile();
        saveProfile();
      });
      row.append(label, input, output);
      host.appendChild(row);
      c.input = input;
      c.output = output;
    }

    bindColor("wallColor", "materials.wallColor");
    bindColor("floorColor", "materials.floorColor");
    bindColor("ledColor", "lighting.ledColor");
    bindColor("goalColor", "lighting.goalColor");
  }

  function bindColor(id, path) {
    const input = el(id);
    input.value = getPath(profile, path);
    input.addEventListener("input", () => {
      setPath(profile, path, input.value);
      applyProfile();
      saveProfile();
      if (mapVisible) drawMap();
    });
  }

  function syncPanel() {
    for (const c of controls) {
      c.input.value = getPath(profile, c.path);
      const value = Number(c.input.value);
      c.output.textContent = `${c.digits !== undefined ? value.toFixed(c.digits) : value}${c.unit || ""}`;
    }
    el("wallColor").value = profile.materials.wallColor;
    el("floorColor").value = profile.materials.floorColor;
    el("ledColor").value = profile.lighting.ledColor;
    el("goalColor").value = profile.lighting.goalColor;
  }

  function applyProfile() {
    if (!scene) return;
    camera.fov = BABYLON.Tools.ToRadians(profile.camera.fov);
    scene.fogDensity = profile.post.fogDensity;
    scene.imageProcessingConfiguration.exposure = profile.post.exposure;
    scene.imageProcessingConfiguration.contrast = profile.post.contrast;
    scene.imageProcessingConfiguration.vignetteWeight = profile.post.vignette;
    pipeline.bloomWeight = profile.post.bloom;
    pipeline.bloomThreshold = profile.post.bloomThreshold;

    ambientLight.intensity = profile.lighting.ambientIntensity;
    playerLight.intensity = profile.lighting.playerLightIntensity;
    playerLight.range = profile.lighting.playerLightRange;

    wallMaterial.albedoColor = BABYLON.Color3.FromHexString(profile.materials.wallColor);
    wallMaterial.roughness = profile.materials.wallRoughness;
    wallCoreMaterial.diffuseColor = BABYLON.Color3.FromHexString(profile.materials.wallColor).scale(0.48);
    floorMaterial.albedoColor = BABYLON.Color3.FromHexString(profile.materials.floorColor);
    floorMaterial.roughness = profile.materials.floorRoughness;
    floorMaterial.metallic = profile.materials.floorMetallic;

    const led = BABYLON.Color3.FromHexString(profile.lighting.ledColor).scale(profile.lighting.ledIntensity);
    ledMaterial.emissiveColor = led;
    ledMaterial.diffuseColor = BABYLON.Color3.FromHexString(profile.lighting.ledColor).scale(0.35);
    const goal = BABYLON.Color3.FromHexString(profile.lighting.goalColor).scale(5.0);
    goalMaterial.emissiveColor = goal;
    goalMaterial.diffuseColor = BABYLON.Color3.FromHexString(profile.lighting.goalColor);
  }

  function setupEvents() {
    document.addEventListener("keydown", (event) => {
      if (["INPUT", "SELECT"].includes(document.activeElement.tagName)) return;
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      if (key === "w" || key === "arrowup") queueMove(1);
      else if (key === "s" || key === "arrowdown") queueMove(-1);
      else if (key === "a" || key === "arrowleft") queueTurn(1);
      else if (key === "d" || key === "arrowright") queueTurn(-1);
      else if (key === "m" || key === " ") toggleMap();
      else if (key === "r") regenerateFromPanel();
      else if (key === "enter" && complete) nextLevel();
      else if (key === "escape" && mapVisible) toggleMap(false);
    });

    el("mapOverlay").addEventListener("click", (e) => {
      if (e.target === el("mapOverlay")) toggleMap(false);
    });
    el("nextButton").addEventListener("click", nextLevel);
    el("regenerateButton").addEventListener("click", regenerateFromPanel);
    el("mazeSize").addEventListener("change", regenerateFromPanel);

    el("closePanel").addEventListener("click", () => setPanel(false));
    el("panelToggle").addEventListener("click", () => setPanel(el("lookPanel").classList.contains("closed")));

    el("copyProfileButton").addEventListener("click", async () => {
      const text = JSON.stringify(profile, null, 2);
      try { await navigator.clipboard.writeText(text); showToast("LOOK JSON copied"); }
      catch (_) { fallbackCopy(text); }
    });
    el("downloadProfileButton").addEventListener("click", () => downloadJson("visual-profile.json", profile));
    el("downloadMazeButton").addEventListener("click", () => downloadJson(`${mazeData.id}.json`, mazeData));
    el("resetLookButton").addEventListener("click", () => {
      profile = clone(DEFAULT_PROFILE);
      syncPanel();
      applyProfile();
      saveProfile();
      showToast("LOOK reset");
    });

    canvas.addEventListener("pointerdown", () => canvas.focus());
  }

  function regenerateFromPanel() {
    const size = Number(el("mazeSize").value);
    const seed = Math.max(1, Number(el("mazeSeed").value) || 1);
    level = (size - 5) / 2;
    rebuildMaze(size, seed, false);
    showToast("Maze regenerated");
  }

  function setPanel(open) {
    el("lookPanel").classList.toggle("closed", !open);
    el("panelToggle").setAttribute("aria-expanded", String(open));
    canvas.focus();
  }

  function fallbackCopy(text) {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    showToast("LOOK JSON copied");
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${filename} exported`);
  }

  function showToast(text) {
    const t = el("toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1400);
  }

  init();
})();
