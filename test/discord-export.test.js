const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DISCORD_EXPORT_PRESET_LIST,
  getDiscordExportPreset,
  parseSvgDimensions,
} = require("../src/lib/discord-export");

test("Discord export presets expose expected targets", () => {
  const ids = DISCORD_EXPORT_PRESET_LIST.map((preset) => preset.id).sort();
  assert.deepEqual(ids, ["attachment-webp", "emoji-gif", "emoji-webp", "sticker-apng"]);

  const emojiGif = getDiscordExportPreset("emoji-gif");
  assert.equal(emojiGif.sizeLimitBytes, 256 * 1024);
  assert.equal(emojiGif.format, "gif");
});

test("Discord export preset defaults to attachment-webp", () => {
  const preset = getDiscordExportPreset("");
  assert.equal(preset.id, "attachment-webp");
});

test("parseSvgDimensions reads width and height attributes", () => {
  const svg = '<svg width="480" height="270" viewBox="0 0 480 270"></svg>';
  const dimensions = parseSvgDimensions(svg);
  assert.equal(dimensions.width, 480);
  assert.equal(dimensions.height, 270);
  assert.equal(dimensions.source, "attributes");
});

test("parseSvgDimensions falls back to viewBox", () => {
  const svg = '<svg viewBox="0 0 320 180"></svg>';
  const dimensions = parseSvgDimensions(svg);
  assert.equal(dimensions.width, 320);
  assert.equal(dimensions.height, 180);
  assert.equal(dimensions.source, "viewBox");
});
