function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function pickInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildVideoGameSeed() {
  return {
    category: "video-games",
    style: pick(["pixel-art", "stylized 2d", "anime action", "arcade fantasy"]),
    heroType: pick(["swordsman", "samurai", "knight", "rogue fighter"]),
    setting: pick(["ruined temple", "neon arena", "forest shrine", "castle bridge"]),
    swordStyle: pick(["katana", "greatsword", "crystal blade", "flame sword"]),
    enemySilhouette: pick(["shadow beast", "armored golem", "spectral knight", "flying demon"]),
    camera: pick(["side view", "three-quarter view", "slightly low angle"]),
    slashColor: pick(["electric blue", "golden", "crimson", "mint green"]),
    tempoSeconds: pickInt(2, 3),
  };
}

function buildPlantsSeed() {
  return {
    category: "plants-growing",
    style: pick(["botanical illustration", "stylized nature", "minimal flat", "storybook"]),
    plantType: pick(["sunflower", "monstera", "bamboo shoot", "rose vine"]),
    environment: pick(["window planter", "greenhouse shelf", "forest floor patch", "clay pot"]),
    lighting: pick(["morning light", "golden hour", "soft overcast light"]),
    accent: pick(["dew drops", "floating pollen", "gentle sparkles", "small butterflies"]),
    growthSpeed: pick(["slow and calm", "medium and lively"]),
    tempoSeconds: pickInt(3, 5),
  };
}

function buildWeatherSeed() {
  return {
    category: "weather",
    style: pick(["graphic weather-map style", "cinematic sky", "soft painterly", "clean vector"]),
    weatherType: pick(["thunderstorm", "snow flurry", "windy clouds", "rain shower"]),
    landscape: pick(["coastal cliff", "city skyline", "open meadow", "mountain valley"]),
    skyPalette: pick(["teal and navy", "gray and violet", "sunset orange and blue", "pale cyan and white"]),
    motion: pick(["rolling cloud layers", "diagonal rainfall", "swirling gust lines", "flickering lightning"]),
    intensity: pick(["gentle", "moderate", "dramatic"]),
    tempoSeconds: pickInt(3, 6),
  };
}

function buildMadlibSeed() {
  const category = pick(["video-games", "plants-growing", "weather"]);
  if (category === "video-games") {
    return buildVideoGameSeed();
  }
  if (category === "plants-growing") {
    return buildPlantsSeed();
  }
  return buildWeatherSeed();
}

function buildMadlibText(seed) {
  if (seed.category === "video-games") {
    return [
      "Domain: Video games",
      "Make a single animated SVG prompt using this mad-lib seed.",
      `Style: ${seed.style}`,
      `Hero: ${seed.heroType}`,
      `Setting: ${seed.setting}`,
      `Weapon: ${seed.swordStyle}`,
      `Enemy silhouette: ${seed.enemySilhouette}`,
      `Camera: ${seed.camera}`,
      `Slash color: ${seed.slashColor}`,
      `Loop duration target: ${seed.tempoSeconds}s`,
      "Constraint: include a readable anticipation -> swing -> recovery beat.",
    ].join("\n");
  }

  if (seed.category === "plants-growing") {
    return [
      "Domain: Plants growing",
      "Make a single animated SVG prompt using this mad-lib seed.",
      `Style: ${seed.style}`,
      `Plant: ${seed.plantType}`,
      `Environment: ${seed.environment}`,
      `Lighting: ${seed.lighting}`,
      `Accent detail: ${seed.accent}`,
      `Growth speed: ${seed.growthSpeed}`,
      `Loop duration target: ${seed.tempoSeconds}s`,
      "Constraint: focus on stem/leaf growth and subtle secondary motion.",
    ].join("\n");
  }

  return [
    "Domain: Weather",
    "Make a single animated SVG prompt using this mad-lib seed.",
    `Style: ${seed.style}`,
    `Weather type: ${seed.weatherType}`,
    `Landscape: ${seed.landscape}`,
    `Sky palette: ${seed.skyPalette}`,
    `Primary motion: ${seed.motion}`,
    `Intensity: ${seed.intensity}`,
    `Loop duration target: ${seed.tempoSeconds}s`,
    "Constraint: emphasize layered atmospheric motion and clean readability.",
  ].join("\n");
}

module.exports = {
  buildMadlibSeed,
  buildMadlibText,
};
