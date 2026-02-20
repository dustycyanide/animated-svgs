const FIXED_WEB_PROMPTS = [
  "Generate an SVG of a 3D isometric cardboard box that drops, folds its flaps, seals with tape, and turns into a confirmation checkmark. Crisp vector illustration with warm orange and neutral grey tones",
  "Generate an SVG of a chameleon sitting quietly on a branch. Make the chameleon's eyes follow the user's cursor as it moves across the screen",
  "Generate an SVG animation of two minimal isometric smartphones where a gold coin flips out of one screen and travels along a dashed path into a digital wallet on the second screen. Flat UI style with pastel blue and green tones",
  "Generate an SVG of a sliding toggle switch where hovering over the sun icon turns it into a glowing moon, smoothly fading the background from light to dark. Clean flat UI style",
  "Generate a 4:3 SVG of an organic, minimalist illustration of a small sprout in a pot, where the stem smoothly grows taller and leaves scale up sequentially on hover. Earthy green and terracotta flat vectors on a beige background",
];

let nextPromptIndex = 0;

function getNextFixedPrompt() {
  const index = nextPromptIndex % FIXED_WEB_PROMPTS.length;
  nextPromptIndex += 1;

  return {
    prompt: FIXED_WEB_PROMPTS[index],
    promptIndex: index,
    promptCount: FIXED_WEB_PROMPTS.length,
  };
}

module.exports = {
  FIXED_WEB_PROMPTS,
  getNextFixedPrompt,
};
