      - name: Prepare game files
        run: |
          mkdir -p www
          cp index.html style.css games.js manifest.json service-worker.js www/
          cp icon-512.png www/icon-512.png
import * as THREE from "three";

const $ = id => document.getElementById(id);
const DB = "sebyRunner3D";

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(DB) || "{}");
  } catch {
    return {};
  }
};

let saved = read();

let profile = {
  coins: 0,
  best: 0,
  owned: ["runner"],
  equipped: "runner",
  equippedBoard: "blue",
  claimedAt: 0,
  claimedDay: "",
  challengeProgress: {},
  ...saved
};

if (!Array.isArray(profile.owned)) profile.owned = ["runner"];
if (!profile.owned.includes("runner")) profile.owned.push("runner");
if (!profile.challengeProgress) profile.challengeProgress = {};

const state = {
  running: false,
  paused: false,
  lane: 0,
  targetLane: 0,
  jumpY: 0,
  jumpV: 0,
  sliding: 0,
  speed: 19,
  distance: 0,
  score: 0,
  runCoins: 0,
  spawn: 1,
  coinSpawn: 1.25,
  obstacles: [],
  coins: [],
  sound: saved.sound !== false,
  vibration: saved.vibration !== false,
  language: saved.language || "fr",
  music: null,
  hoverUntil: 0,
  hoverActive: false
};

let scene, camera, renderer, player, body, board;
let shirtMat, pantsMat, deckMat, hairMat;
let characterAccessory, hoverFx, hoverFlames = [];
let roadLines = [], city = [], clouds = [];
let last = performance.now(), toastTimer, lastTapAt = 0;
let worldGroup;
let audio;

const items = [
  {
    id: "runner",
    name: "Seby Runner",
    emoji: "🏃🏽",
    price: 0,
    desc: "Le héros original de SEBY RUNNER.",
    color: 0x3ee7ff
  },
  {
    id: "neon",
    name: "Neon Rider",
    emoji: "🧑🏾‍🚀",
    price: 450,
    desc: "Tenue futuriste aux reflets néon.",
    color: 0xa66bff
  },
  {
    id: "ninja",
    name: "Shadow Ninja",
    emoji: "🥷",
    price: 800,
    desc: "Un look furtif pour les longues courses.",
    color: 0x252a54
  },
  {
    id: "blue",
    name: "Blue Comet",
    emoji: "🛹",
    price: 350,
    desc: "Planche bleue et roues lumineuses.",
    color: 0x43dfff
  },
  {
    id: "fire",
    name: "Fire Dash",
    emoji: "🛹",
    price: 650,
    desc: "Skate rouge et or, style rapide.",
    color: 0xff704f
  },
  {
    id: "galaxy",
    name: "Galaxy Wave",
    emoji: "🛹",
    price: 1200,
    desc: "Planche violette effet galaxie.",
    color: 0xa66bff
  }
];

const missions = [
  {
    id: "distance",
    name: "Premiers pas",
    desc: "Parcours 500 mètres au total.",
    goal: 500,
    reward: 20,
    unit: "m"
  },
  {
    id: "coins",
    name: "Chasseur de pièces",
    desc: "Ramasse 25 pièces.",
    goal: 25,
    reward: 25,
    unit: "pièces"
  },
  {
    id: "runs",
    name: "Encore une course",
    desc: "Termine 3 courses.",
    goal: 3,
    reward: 30,
    unit: "courses"
  }
];

const persist = () => {
  localStorage.setItem(DB, JSON.stringify(profile));
};

function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

function vibrate(pattern = 35) {
  if (state.vibration && navigator.vibrate) navigator.vibrate(pattern);
}

function tone(frequency = 440, duration = 0.09, type = "sine", volume = 0.025) {
  if (!state.sound) return;

  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();

    const oscillator = audio.createOscillator();
    const gain = audio.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audio.currentTime + duration
    );

    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
  } catch {}
}

function musicStart() {
  musicStop();
  if (!state.sound) return;

  let index = 0;
  const notes = [392, 494, 587, 494, 440, 523, 659, 523];

  state.music = setInterval(() => {
    if (state.running && !state.paused) {
      tone(notes[index++ % notes.length], 0.12, "triangle", 0.009);
    }
  }, 330);
}

function musicStop() {
  clearInterval(state.music);
  state.music = null;
}

function hud() {
  if ($("score")) {
    $("score").textContent = Math.floor(state.score).toLocaleString();
  }
  if ($("best")) {
    $("best").textContent = Math.floor(profile.best).toLocaleString();
  }
  if ($("coins")) {
    $("coins").textContent = Number(profile.coins || 0).toLocaleString();
  }
}

function screen(id) {
  document.querySelectorAll(".screen").forEach(el => {
    el.classList.remove("active");
    el.classList.add("hidden");
  });

  $(id)?.classList.remove("hidden");
  $(id)?.classList.add("active");
}

function hide(id) {
  $(id)?.classList.remove("active");
  $(id)?.classList.add("hidden");
}

function controls(show) {
  $("gameControls")?.classList.toggle("hidden", !show);
  if ($("hud")) $("hud").style.display = "flex";
}

function openPanel(which) {
  if (state.running) {
    state.paused = true;
    musicStop();
  }

  const titles = {
    challenges: "Défis",
    shop: "Boutique",
    rewards: "Récompenses",
    settings: "Paramètres",
    support: "Soutenir le jeu"
  };

  $("panelTitle").textContent = titles[which] || "Menu";

  const root = $("panelContent");
  root.innerHTML = "";

  if (which === "shop") shop(root);
  else if (which === "challenges") challengePanel(root);
  else if (which === "rewards") rewards(root);
  else if (which === "settings") settings(root);
  else support(root);

  $("panel").classList.remove("hidden");
}

function closePanel() {
  $("panel").classList.add("hidden");

  if (state.running) {
    state.paused = false;
    last = performance.now();
    musicStart();
  }
}

function shop(root) {
  root.innerHTML = `
    <p class="section-intro">
      Choisis ton style. Tes objets restent dans ta collection.
    </p>
    <div class="shop-grid"></div>
  `;

  const grid = root.querySelector(".shop-grid");

  items.forEach(item => {
    const owned = profile.owned.includes(item.id);

    const isBoard = ["blue", "fire", "galaxy"].includes(item.id);
    const equipped = isBoard
      ? profile.equippedBoard === item.id
      : profile.equipped === item.id;

    const card = document.createElement("article");
    card.className = "shop-item";

    card.innerHTML = `
      <div class="item-art">${item.emoji}</div>
      <div class="item-name">${item.name}</div>
      <div class="item-desc">${item.desc}</div>
      <div class="item-bottom">
        <span class="price">
          ${item.price ? "🟡 " + item.price : "GRATUIT"}
        </span>
        <button class="mini-button">
          ${equipped ? "ÉQUIPÉ" : owned ? "ÉQUIPER" : "ACHETER"}
        </button>
      </div>
    `;

    card.querySelector(".item-art").style.background =
      `radial-gradient(circle, #${item.color.toString(16).padStart(6, "0")}aa, #101c3a 72%)`;

    const button = card.querySelector("button");
    button.disabled = equipped;

    button.onclick = () => {
      if (owned) {
        equipItem(item.id);
        persist();
        updateEquippedAppearance();
        tone(650);
        toast(item.name + " équipé !");
        shop(root);
      } else {
        buy(item);
      }
    };

    grid.appendChild(card);
  });
}

function equipItem(id) {
  if (["blue", "fire", "galaxy"].includes(id)) {
    profile.equippedBoard = id;
  } else {
    profile.equipped = id;
  }
}

function updateEquippedAppearance() {
  const outfits = {
    runner: {
      shirt: 0x16c9ed,
      pants: 0x19263d,
      hair: 0x171624,
      glow: 0x062b35
    },
    neon: {
      shirt: 0xa66bff,
      pants: 0x15172f,
      hair: 0x251044,
      glow: 0x34105c
    },
    ninja: {
      shirt: 0x252a54,
      pants: 0x111322,
      hair: 0x080914,
      glow: 0x080b20
    }
  };

  const outfit = outfits[profile.equipped] || outfits.runner;

  if (shirtMat) {
    shirtMat.color.setHex(outfit.shirt);
    shirtMat.emissive.setHex(outfit.glow);
  }

  if (pantsMat) pantsMat.color.setHex(outfit.pants);
  if (hairMat) hairMat.color.setHex(outfit.hair);

  if (characterAccessory && body) {
    body.remove(characterAccessory);
    characterAccessory = null;
  }

  if (body) {
    characterAccessory = new THREE.Group();

    if (profile.equipped === "neon") {
      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.10, 0.29),
        new THREE.MeshStandardMaterial({
          color: 0x43e7ff,
          emissive: 0x1688a0,
          metalness: 0.4
        })
      );
      visor.position.set(0, 1.79, 0.22);
      characterAccessory.add(visor);

      const badge = new THREE.Mesh(
        new THREE.BoxGeometry(0.20, 0.20, 0.04),
        new THREE.MeshStandardMaterial({
          color: 0x43e7ff,
          emissive: 0x1688a0
        })
      );
      badge.position.set(0, 1.2, 0.205);
      characterAccessory.add(badge);
    } else if (profile.equipped === "ninja") {
      const mask = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.17, 0.28),
        new THREE.MeshStandardMaterial({
          color: 0x111322,
          roughness: 0.9
        })
      );
      mask.position.set(0, 1.63, 0.10);
      characterAccessory.add(mask);

      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.07, 0.30),
        new THREE.MeshStandardMaterial({
          color: 0xff405d,
          emissive: 0x55101e
        })
      );
      band.position.set(0, 1.86, 0);
      characterAccessory.add(band);
    }

    body.add(characterAccessory);
  }

  if (deckMat) {
    const boards = {
      blue: { color: 0x43dfff, emissive: 0x0d5468 },
      fire: { color: 0xff704f, emissive: 0x65200d },
      galaxy: { color: 0xa66bff, emissive: 0x34105c }
    };

    const boardStyle = boards[profile.equippedBoard] || boards.blue;
    deckMat.color.setHex(boardStyle.color);
    deckMat.emissive.setHex(boardStyle.emissive);
  }
}

function buy(item) {
  if (profile.owned.includes(item.id)) {
    equipItem(item.id);
    persist();
    updateEquippedAppearance();
    hud();
    shop($("panelContent"));
    return;
  }

  if (profile.coins < item.price) {
    tone(150, 0.15, "square");
    toast("Pas assez de pièces. Continue à courir !");
    return;
  }

  profile.coins -= item.price;
  profile.owned.push(item.id);
  equipItem(item.id);

  persist();
  updateEquippedAppearance();
  hud();

  vibrate([35, 45, 75]);
  tone(660, 0.15, "triangle", 0.05);
  setTimeout(() => tone(880, 0.2, "triangle", 0.04), 120);

  $("purchaseEmoji").textContent = item.emoji;
  $("purchaseName").textContent = item.name;
  $("purchaseText").textContent =
    item.name + " a rejoint ta collection.";

  $("equipBtn").dataset.item = item.id;
  $("purchaseModal").classList.remove("hidden");

  shop($("panelContent"));
}

function closePurchase() {
  $("purchaseModal").classList.add("hidden");
}

function challengePanel(root) {
  const progress = profile.challengeProgress || {};

  root.innerHTML = `
    <p class="section-intro">
      Suis ta progression et récupère les récompenses quand tu termines un défi.
    </p>
    <div class="challenge-list"></div>
  `;

  const list = root.querySelector(".challenge-list");

  missions.forEach(mission => {
    const value = Math.min(
      mission.goal,
      Number(progress[mission.id] || 0)
    );

    const done = value >= mission.goal;
    const claimed = !!progress[mission.id + "_claimed"];

    const element = document.createElement("div");
    element.className = "challenge";

    element.innerHTML = `
      <div class="challenge-top">
        <span>${mission.name}</span>
        <span>🟡 +${mission.reward}</span>
      </div>
      <p>${mission.desc}</p>
      <div class="progress">
        <span style="width:${100 * value / mission.goal}%"></span>
      </div>
      <div class="challenge-foot">
        <span>${value}/${mission.goal} ${mission.unit}</span>
        <button class="mini-button" ${!done || claimed ? "disabled" : ""}>
          ${claimed ? "RÉCUPÉRÉ" : done ? "RÉCUPÉRER" : "EN COURS"}
        </button>
      </div>
    `;

    element.querySelector("button").onclick = () => {
      if (!done || claimed) return;

      profile.coins += mission.reward;
      progress[mission.id + "_claimed"] = true;
      profile.challengeProgress = progress;

      persist();
      hud();
      tone(700);
      toast("Défi terminé : +" + mission.reward + " pièces");
      challengePanel(root);
    };

    list.appendChild(element);
  });
}

function canClaimDaily() {
  return Date.now() - Number(profile.claimedAt || 0) >= 86400000;
}

function rewards(root) {
  const claimed = !canClaimDaily();

  root.innerHTML = `
    <p class="section-intro">
      Une publicité récompensée complète est nécessaire pour recevoir +20 pièces,
      une fois toutes les 24 heures.
    </p>
    <div class="reward-list">
      <div class="reward-row">
        <div class="reward-icon">🎁</div>
        <div class="reward-copy">
          <b>Récompense quotidienne — +20 pièces</b>
          <small>
            ${claimed
              ? "Tu as déjà récupéré cette récompense. Reviens après 24 heures."
              : "La récompense doit être confirmée par le système publicitaire."}
          </small>
        </div>
        <button id="claim" class="mini-button" disabled>
          ${claimed ? "DÉJÀ RÉCUPÉRÉ" : "PUBLICITÉ NON CONNECTÉE"}
        </button>
      </div>
    </div>
    <p class="reward-note">
      Les récompenses publicitaires restent désactivées tant qu'un fournisseur
      publicitaire réel n'a pas été connecté.
    </p>
  `;
}

/*
 * Intégration publicitaire :
 * le fournisseur réel doit appeler cette fonction uniquement après
 * confirmation authentique de la fin d'une publicité récompensée.
 *
 * Ne pas appeler cette fonction depuis un simple clic sur un bouton.
 */
window.sebyRunnerRewardedAdCompleted = function () {
  if (!canClaimDaily()) {
    toast("Récompense déjà récupérée. Reviens plus tard.");
    return false;
  }

  profile.coins += 20;
  profile.claimedAt = Date.now();
  profile.claimedDay = new Date().toISOString().slice(0, 10);

  persist();
  hud();
  tone(740, 0.15);
  vibrate();
  toast("+20 pièces ajoutées !");
  return true;
};

function settings(root) {
  root.innerHTML = `
    <div class="setting-list">
      <div class="setting-row">
        <div>
          <b>Effets sonores & musique</b>
          <small>Petits sons pendant la course.</small>
        </div>
        <button class="toggle ${state.sound ? "on" : ""}" data-set="sound">
          <span></span>
        </button>
      </div>

      <div class="setting-row">
        <div>
          <b>Vibration</b>
          <small>Sur les appareils compatibles.</small>
        </div>
        <button class="toggle ${state.vibration ? "on" : ""}" data-set="vibration">
          <span></span>
        </button>
      </div>

      <div class="setting-row">
        <div>
          <b>Langue</b>
          <small>Choisis l'interface.</small>
        </div>
        <select id="lang">
          <option value="fr">Français</option>
          <option value="ht">Kreyòl ayisyen</option>
          <option value="en">English</option>
        </select>
      </div>

      <div class="setting-row">
        <div>
          <b>Qualité graphique</b>
          <small>Réduis les effets si le téléphone ralentit.</small>
        </div>
        <select id="quality">
          <option value="high">Élevée</option>
          <option value="balanced">Équilibrée</option>
          <option value="low">Économie</option>
        </select>
      </div>
    </div>
  `;

  $("lang").value = state.language;
  $("quality").value = read().quality || "high";

  root.querySelectorAll("[data-set]").forEach(button => {
    button.onclick = () => {
      if (button.dataset.set === "sound") {
        state.sound = !state.sound;
        if (state.sound) {
          tone(520);
          musicStart();
        } else {
          musicStop();
        }
      } else {
        state.vibration = !state.vibration;
      }

      button.classList.toggle(
        "on",
        button.dataset.set === "sound" ? state.sound : state.vibration
      );

      profile.sound = state.sound;
      profile.vibration = state.vibration;
      persist();
    };
  });

  $("lang").onchange = event => {
    state.language = event.target.value;
    profile.language = state.language;
    persist();
    applyLanguage();
    toast("Langue mise à jour");
  };

  $("quality").onchange = event => {
    profile.quality = event.target.value;
    persist();

    if (renderer) {
      const ratio = event.target.value === "low"
        ? 1
        : event.target.value === "balanced" ? 1.3 : 1.7;

      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, ratio));
      renderer.setSize(innerWidth, innerHeight);
    }

    toast("Qualité graphique mise à jour");
  };
}

function applyLanguage() {
  const translations = {
    fr: {
      play: "▶ JOUER",
      challenges: "Défis",
      shop: "Boutique",
      rewards: "Récompenses",
      settings: "Paramètres",
      support: "Soutenir le jeu"
    },
    ht: {
      play: "▶ JWE",
      challenges: "Defi",
      shop: "Boutik",
      rewards: "Rekonpans",
      settings: "Paramèt",
      support: "Sipòte jwèt la"
    },
    en: {
      play: "▶ PLAY",
      challenges: "Challenges",
      shop: "Shop",
      rewards: "Rewards",
      settings: "Settings",
      support: "Support the game"
    }
  };

  const t = translations[state.language] || translations.fr;

  document.querySelectorAll("[data-panel]").forEach(button => {
    const label = button.querySelector("b");
    if (label && t[button.dataset.panel]) {
      label.textContent = t[button.dataset.panel];
    }
  });

  $("playBtn").firstChild.textContent = t.play + " ";
}

function support(root) {
  root.innerHTML = `
    <p class="section-intro">
      Vérifie le destinataire avant tout paiement.
    </p>

    <div class="setting-list">
      <div class="support-row">
        <div class="reward-icon">💙</div>
        <div class="reward-copy">
          <b>Soutien PayPal</b>
          <small class="support-value">sebastiensylne06@gmail.com</small>
        </div>
        <button class="copy-button" data-copy="sebastiensylne06@gmail.com">
          COPIER
        </button>
      </div>

      <div class="support-row">
        <div class="reward-icon">📱</div>
        <div class="reward-copy">
          <b>NatCash</b>
          <small class="support-value">40 09 8873</small>
        </div>
        <button class="copy-button" data-copy="40 09 8873">
          COPIER
        </button>
      </div>
    </div>

    <p class="reward-note">Aucun paiement n'est déclenché depuis le jeu.</p>
  `;

  root.querySelectorAll("[data-copy]").forEach(button => {
    button.onclick = async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        toast("Copié !");
      } catch {
        toast(button.dataset.copy);
      }
    };
  });
}

function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8dc8f2);
  scene.fog = new THREE.Fog(0x8dc8f2, 38, 145);

  camera = new THREE.PerspectiveCamera(
    60,
    innerWidth / innerHeight,
    0.1,
    240
  );
  camera.position.set(0, 5.2, 10.7);
  camera.lookAt(0, 1, -4);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance"
  });

  const quality = read().quality || "high";
  const ratio = quality === "low" ? 1 : quality === "balanced" ? 1.3 : 1.7;

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, ratio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  $("world").appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xdff4ff, 0x36445e, 2));

  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.set(-10, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 260),
    new THREE.MeshStandardMaterial({ color: 0x28344d })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.13, -65);
  scene.add(ground);

  worldGroup = new THREE.Group();
  scene.add(worldGroup);

  const road = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.18, 220),
    new THREE.MeshStandardMaterial({ color: 0x252b3a })
  );
  road.position.set(0, 0, -78);
  worldGroup.add(road);

  for (const x of [-4.5, 4.5]) {
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.13, 220),
      new THREE.MeshStandardMaterial({
        color: 0x42dfff,
        emissive: 0x0b5a7a
      })
    );
    edge.position.set(x, 0.11, -78);
    worldGroup.add(edge);
  }

  const lineMaterial = new THREE.MeshStandardMaterial({
    color: 0xdceaff,
    emissive: 0x334f75
  });

  for (let z = 10; z > -190; z -= 8) {
    for (const x of [-1.5, 1.5]) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.035, 3.5),
        lineMaterial
      );
      line.position.set(x, 0.105, z);
      worldGroup.add(line);
      roadLines.push(line);
    }
  }

  const buildingMaterials = [
    0x30476b, 0x4a5878, 0x263959,
    0x5b6687, 0x26324a, 0x3e526b
  ].map(color => new THREE.MeshStandardMaterial({ color }));

  for (const side of [-1, 1]) {
    for (let i = 0; i < 30; i++) {
      const width = 2.5 + Math.random() * 3.5;
      const height = 5 + Math.random() * 20;
      const depth = 4 + Math.random() * 8;
      const z = -i * 7 - 6;

      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        buildingMaterials[Math.floor(Math.random() * buildingMaterials.length)]
      );

      building.position.set(
        side * (7 + width / 2 + Math.random() * 5),
        height / 2,
        z
      );

      worldGroup.add(building);
      city.push(building);

      const windowMaterial = new THREE.MeshStandardMaterial({
        color: [0x7deaff, 0xffd580, 0x91a9ff][Math.floor(Math.random() * 3)],
        emissive: 0x234e7b
      });

      for (let y = 1.2; y < height - 1; y += 2.1) {
        for (let x = -width / 2 + 0.5; x < width / 2 - 0.3; x += 1.05) {
          const windowMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.65, 0.035),
            windowMaterial
          );

          windowMesh.position.set(
            building.position.x + x,
            y,
            z + depth / 2 + 0.02
          );

          worldGroup.add(windowMesh);
          city.push(windowMesh);
        }
      }
    }
  }

  const cloudMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });

  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group();

    for (let j = 0; j < 5; j++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.8 + Math.random() * 0.7, 8, 7),
        cloudMaterial
      );

      puff.position.set(j * 0.9, Math.random() * 0.5, Math.random() * 0.3);
      cloud.add(puff);
    }

    cloud.position.set(
      (Math.random() - 0.5) * 50,
      13 + Math.random() * 10,
      -i * 22 - 5
    );

    scene.add(cloud);
    clouds.push(cloud);
  }

  const sunDisk = new THREE.Mesh(
    new THREE.SphereGeometry(3, 20, 16),
    new THREE.MeshBasicMaterial({ color: 0xffdba1 })
  );
  sunDisk.position.set(-24, 22, -95);
  scene.add(sunDisk);

  player = new THREE.Group();
  player.position.set(0, 0, 3);
  scene.add(player);

  body = new THREE.Group();
  player.add(body);

  const skin = new THREE.MeshStandardMaterial({ color: 0x9b603e });
  shirtMat = new THREE.MeshStandardMaterial({ color: 0x16c9ed });
  pantsMat = new THREE.MeshStandardMaterial({ color: 0x19263d });
  hairMat = new THREE.MeshStandardMaterial({ color: 0x171624 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0xf6f8ff });

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.8, 0.38),
    shirtMat
  );
  torso.position.y = 1.15;
  body.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 16, 12),
    skin
  );
  head.position.y = 1.78;
  body.add(head);

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.265, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
    hairMat
  );
  hair.position.y = 1.86;
  body.add(hair);

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.62, 0.25),
      pantsMat
    );
    leg.position.set(side * 0.19, 0.48, 0);
    body.add(leg);

    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.13, 0.38),
      shoe
    );
    foot.position.set(side * 0.19, 0.15, -0.04);
    body.add(foot);

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.62, 0.2),
      skin
    );
    arm.position.set(side * 0.43, 1.18, 0);
    body.add(arm);
  }

  board = new THREE.Group();
  board.position.y = 0.09;
  player.add(board);

  deckMat = new THREE.MeshStandardMaterial({
    color: 0x43e7ff,
    metalness: 0.25,
    emissive: 0x0d5468
  });

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.09, 1.2),
    deckMat
  );
  board.add(deck);

  for (const z of [-0.38, 0.38]) {
    for (const x of [-0.25, 0.25]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 0.07, 12),
        new THREE.MeshStandardMaterial({ color: 0x161c2a })
      );

      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, -0.1, z);
      board.add(wheel);
    }
  }

  // Efè dife anba skateboard la pandan boost la.
  hoverFx = new THREE.Group();
  hoverFx.visible = false;
  player.add(hoverFx);

  for (const x of [-0.22, 0.22]) {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.52, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff6a24,
        transparent: true,
        opacity: 0.9
      })
    );

    flame.position.set(x, -0.35, -0.15);
    flame.rotation.x = Math.PI;
    hoverFx.add(flame);
    hoverFlames.push(flame);

    const core = new THREE.Mesh(
      new THREE.ConeGeometry(0.065, 0.30, 7),
      new THREE.MeshBasicMaterial({
        color: 0xffe66d,
        transparent: true,
        opacity: 0.95
      })
    );

    core.position.set(x, -0.28, -0.15);
    core.rotation.x = Math.PI;
    hoverFx.add(core);
    hoverFlames.push(core);
  }

  updateEquippedAppearance();
  window.addEventListener("resize", resize);
  renderer.setAnimationLoop(animate);
}

function resize() {
  if (!camera || !renderer) return;

  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function spawnObstacle() {
  const lane = Math.floor(Math.random() * 3) - 1;
  const random = Math.random();

  const type = random < 0.43
    ? "barrier"
    : random < 0.74 ? "overhead" : "train";

  const group = new THREE.Group();
  group.position.set(lane * 3, 0, -95);

  const material = new THREE.MeshStandardMaterial({
    color: type === "barrier"
      ? 0xff8a45
      : type === "overhead" ? 0x9b7bff : 0x4c6f9b,
    metalness: 0.2
  });

  if (type === "barrier") {
    const barrier = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 0.8, 0.55),
      material
    );
    barrier.position.y = 0.4;
    group.add(barrier);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.48, 0.16, 0.58),
      new THREE.MeshStandardMaterial({ color: 0xffe5a4 })
    );
    stripe.position.y = 0.55;
    group.add(stripe);
  } else if (type === "overhead") {
    for (const x of [-0.63, 0.63]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 2.1, 0.5),
        material
      );
      post.position.set(x, 1.05, 0);
      group.add(post);
    }

    const top = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.25, 0.55),
      material
    );
    top.position.y = 2.05;
    group.add(top);
  } else {
    const train = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 2.3, 2.2),
      material
    );
    train.position.y = 1.15;
    group.add(train);

    const front = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.55, 0.08),
      new THREE.MeshStandardMaterial({
        color: 0x9beaff,
        emissive: 0x397fa7
      })
    );
    front.position.set(0, 1.5, 1.15);
    group.add(front);
  }

  group.userData = { type, hit: false };
  worldGroup.add(group);
  state.obstacles.push(group);
}

function spawnCoin() {
  const lane = Math.floor(Math.random() * 3) - 1;

  const coin = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.09, 8, 16),
    new THREE.MeshStandardMaterial({
      color: 0xffd34e,
      metalness: 0.65,
      emissive: 0x8b5600
    })
  );

  coin.position.set(lane * 3, 1.1, -95);
  coin.rotation.x = Math.PI / 2;

  worldGroup.add(coin);
  state.coins.push(coin);
}

function activateHoverboard() {
  if (!state.running || state.paused || state.hoverActive) return;

  state.hoverActive = true;
  state.hoverUntil = performance.now() + 20000;
  state.jumpY = 0;
  state.jumpV = 0;
  state.sliding = 0;

  if (hoverFx) hoverFx.visible = true;

  if (board) board.position.y = 0.62;

  vibrate([35, 30, 65]);
  tone(520, 0.12, "triangle", 0.04);
  setTimeout(() => tone(760, 0.16, "triangle", 0.035), 100);

  toast("SKATE BOOST activé — 20 secondes !");
}

function act(action) {
  if (!state.running || state.paused) return;

  if (action === "left") {
    state.targetLane = Math.max(-1, state.targetLane - 1);
  }

  if (action === "right") {
    state.targetLane = Math.min(1, state.targetLane + 1);
  }

  if (action === "jump" && state.jumpY <= 0.02 && !state.hoverActive) {
    state.jumpV = 8.5;
  }

  if (action === "slide" && !state.hoverActive) {
    state.sliding = 0.7;
  }

  tone(
    action === "jump" ? 520 : action === "slide" ? 250 : 330,
    0.05,
    "triangle",
    0.018
  );
}

function start() {
  if (!renderer) init3D();

  $("panel").classList.add("hidden");
  $("purchaseModal").classList.add("hidden");

  hide("homeScreen");
  hide("gameOver");
  hide("pauseScreen");

  controls(true);

  state.running = true;
  state.paused = false;

  state.lane = 0;
  state.targetLane = 0;
  state.jumpY = 0;
  state.jumpV = 0;
  state.sliding = 0;
  state.distance = 0;
  state.score = 0;
  state.runCoins = 0;
  state.speed = 19;
  state.spawn = 1.1;
  state.coinSpawn = 1.25;
  state.hoverActive = false;
  state.hoverUntil = 0;

  if (hoverFx) hoverFx.visible = false;
  if (board) board.position.y = 0.09;

  state.obstacles.forEach(obstacle => worldGroup.remove(obstacle));
  state.coins.forEach(coin => worldGroup.remove(coin));

  state.obstacles = [];
  state.coins = [];

  player.position.set(0, 0, 3);
  last = performance.now();

  musicStart();
  hud();
}

function end() {
  if (!state.running) return;

  state.running = false;
  state.paused = false;
  state.hoverActive = false;

  musicStop();
  tone(140, 0.25, "sawtooth", 0.04);
  vibrate([70, 45, 100]);

  if (hoverFx) hoverFx.visible = false;
  if (board) board.position.y = 0.09;

  profile.best = Math.max(profile.best, Math.floor(state.score));
  profile.coins += state.runCoins;

  const progress = profile.challengeProgress || {};

  progress.distance = Math.min(
    500,
    Number(progress.distance || 0) + Math.floor(state.distance)
  );

  progress.coins = Math.min(
    25,
    Number(progress.coins || 0) + state.runCoins
  );

  progress.runs = Number(progress.runs || 0) + 1;
  profile.challengeProgress = progress;

  persist();

  $("finalScore").textContent = Math.floor(state.score).toLocaleString();
  $("finalCoins").textContent = state.runCoins;

  hud();
  controls(false);
  screen("gameOver");
}

function animate(now) {
  if (!renderer) return;

  const dt = Math.min((now - last) / 1000, 0.04);
  last = now;

  if (state.running && !state.paused) {
    if (state.hoverActive && now >= state.hoverUntil) {
      state.hoverActive = false;

      if (hoverFx) hoverFx.visible = false;
      if (board) board.position.y = 0.09;

      toast("Le boost skate est terminé.");
    }

    
state.distance += state.speed * dt;
state.score += dt * state.speed * 0.6;

// Vitès nòmal anvan score 180.
const NORMAL_SPEED = 19;

// Score kote akselerasyon rapid la kòmanse.
const SPEED_UP_SCORE = 180;

// Vitès maksimòm jwèt la.
const MAX_SPEED = 60;

// Vitès ogmante rapid apre score 180.
const SPEED_ACCELERATION = 0.16;

if (state.score < SPEED_UP_SCORE) {
  state.speed = NORMAL_SPEED;
} else {
  state.speed = Math.min(
    MAX_SPEED,
    NORMAL_SPEED +
      (state.score - SPEED_UP_SCORE) * SPEED_ACCELERATION
  );
}


    state.spawn -= dt;

    if (state.spawn <= 0) {
      spawnObstacle();
      state.spawn = Math.max(0.82, 1.45 - state.distance / 2400)
        + Math.random() * 0.45;
    }

    state.coinSpawn -= dt;

    if (state.coinSpawn <= 0) {
      spawnCoin();
      state.coinSpawn = 1.15 + Math.random() * 0.75;
    }

    state.lane = THREE.MathUtils.damp(
      state.lane,
      state.targetLane,
      12,
      dt
    );

    player.position.x = state.lane * 3;

    state.jumpY += state.jumpV * dt;
    state.jumpV -= 22 * dt;

    if (state.jumpY < 0) {
      state.jumpY = 0;
      state.jumpV = 0;
    }

    state.sliding = Math.max(0, state.sliding - dt);

    body.scale.y = state.sliding > 0 ? 0.55 : 1;
    body.rotation.z = THREE.MathUtils.damp(
      body.rotation.z,
      -state.lane * 0.08,
      7,
      dt
    );

    player.position.y = state.jumpY + (
      state.hoverActive
        ? 0.12 + Math.sin(now * 0.018) * 0.045
        : Math.sin(now * 0.012) * 0.025
    );

    if (board) {
      board.position.y = state.hoverActive
        ? 0.62 + Math.sin(now * 0.02) * 0.035
        : 0.09;

      board.rotation.z = state.hoverActive
        ? Math.sin(now * 0.006) * 0.045
        : 0;
    }

    if (hoverFx && state.hoverActive) {
      hoverFx.visible = true;

      hoverFlames.forEach((flame, index) => {
        const pulse = 1 + Math.sin(now * 0.025 + index * 1.7) * 0.22;
        flame.scale.set(pulse, pulse, pulse);
        flame.material.opacity =
          0.65 + Math.abs(Math.sin(now * 0.02 + index)) * 0.3;
      });
    }

    player.rotation.y = (state.targetLane - state.lane) * -0.12;

    const travel = state.speed * dt;

    roadLines.forEach(line => {
      line.position.z += travel;
      if (line.position.z > 12) line.position.z -= 200;
    });

    city.forEach(object => {
      object.position.z += travel;
      if (object.position.z > 18) object.position.z -= 230;
    });

    clouds.forEach(cloud => {
      cloud.position.z += travel * 0.12;
      if (cloud.position.z > 25) cloud.position.z = -220;
    });

    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const obstacle = state.obstacles[i];

      obstacle.position.z += travel;

      if (
        obstacle.position.z > 2.5 &&
        !obstacle.userData.hit &&
        obstacle.position.z < 5.4
      ) {
        const sameLane =
          Math.abs(player.position.x - obstacle.position.x) < 1.25;

        const safe = obstacle.userData.type === "barrier"
          ? state.jumpY > 0.85
          : obstacle.userData.type === "overhead"
            ? state.sliding > 0
            : false;

        if (sameLane && !safe && !state.hoverActive) {
          end();
          break;
        }

        obstacle.userData.hit = true;
      }

      if (obstacle.position.z > 14) {
        worldGroup.remove(obstacle);
        state.obstacles.splice(i, 1);
      }
    }

    for (let i = state.coins.length - 1; i >= 0; i--) {
      const coin = state.coins[i];

      coin.position.z += travel;
      coin.rotation.z += dt * 3;

      if (
        Math.abs(coin.position.z - player.position.z) < 1.15 &&
        Math.abs(coin.position.x - player.position.x) < 1.25 &&
        Math.abs(coin.position.y - (player.position.y + 1)) < 1.2
      ) {
        state.runCoins++;
        worldGroup.remove(coin);
        state.coins.splice(i, 1);
        tone(900, 0.07, "sine", 0.03);
        continue;
      }

      if (coin.position.z > 14) {
        worldGroup.remove(coin);
        state.coins.splice(i, 1);
      }
    }

    hud();
  }

  if (camera) {
    camera.position.x = THREE.MathUtils.damp(
      camera.position.x,
      (player?.position.x || 0) * 0.22,
      3,
      dt
    );

    camera.lookAt((player?.position.x || 0) * 0.15, 1.05, -4);
  }

  renderer.render(scene, camera);
}

function home() {
  state.running = false;
  state.paused = false;
  state.hoverActive = false;

  musicStop();

  if (hoverFx) hoverFx.visible = false;
  if (board) board.position.y = 0.09;

  hide("gameOver");
  hide("pauseScreen");

  $("panel").classList.add("hidden");
  $("purchaseModal").classList.add("hidden");

  controls(false);
  screen("homeScreen");
}

function init() {
  init3D();

  $("playBtn").onclick = start;
  $("retryBtn").onclick = start;
  $("homeBtn").onclick = home;

  $("pauseBtn").onclick = () => {
    if (state.running) {
      state.paused = true;
      musicStop();
      screen("pauseScreen");
    }
  };

  $("resumeBtn").onclick = () => {
    hide("pauseScreen");
    state.paused = false;
    last = performance.now();
    musicStart();
  };

  $("pauseHomeBtn").onclick = home;
  $("closePanel").onclick = closePanel;
  $("purchaseClose").onclick = closePurchase;
  $("purchaseOk").onclick = closePurchase;

  $("equipBtn").onclick = () => {
    equipItem($("equipBtn").dataset.item);
    persist();
    updateEquippedAppearance();
    closePurchase();
    toast("Objet équipé !");
    shop($("panelContent"));
  };

  document.querySelectorAll("[data-panel]").forEach(button => {
    button.onclick = () => openPanel(button.dataset.panel);
  });

  document.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      act(button.dataset.action);
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      if (!$("panel").classList.contains("hidden")) {
        closePanel();
      } else if (state.running && !state.paused) {
        state.paused = true;
        musicStop();
        screen("pauseScreen");
      } else if (state.paused) {
        hide("pauseScreen");
        state.paused = false;
        musicStart();
      }
    }

    if (event.key === "ArrowLeft" || event.key === "a") act("left");
    if (event.key === "ArrowRight" || event.key === "d") act("right");
    if (event.key === "ArrowUp" || event.key === " " || event.key === "w") {
      act("jump");
    }
    if (event.key === "ArrowDown" || event.key === "s") act("slide");
  });

  let startTouch = null;

  $("world").addEventListener("touchstart", event => {
    const touch = event.changedTouches[0];
    startTouch = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });

  $("world").addEventListener("touchend", event => {
    if (!startTouch || !state.running || state.paused) {
      startTouch = null;
      return;
    }

    const touch = event.changedTouches[0];
    const dx = touch.clientX - startTouch.x;
    const dy = touch.clientY - startTouch.y;
    const swipe = Math.max(Math.abs(dx), Math.abs(dy)) > 28;

    if (swipe) {
      act(
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0 ? "right" : "left"
          : dy < 0 ? "jump" : "slide"
      );
    } else {
      const tapNow = performance.now();

      if (tapNow - lastTapAt < 350) {
        lastTapAt = 0;
        activateHoverboard();
      } else {
        lastTapAt = tapNow;
      }
    }

    startTouch = null;
  }, { passive: true });

  hud();
  applyLanguage();
  controls(false);
}

init();
