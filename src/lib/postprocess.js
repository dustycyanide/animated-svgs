const { optimize } = require("svgo");

function optimizeSvg(svgText) {
  const result = optimize(svgText, {
    multipass: true,
    js2svg: {
      pretty: true,
      indent: 2,
    },
    plugins: [
      {
        name: "preset-default",
        params: {
          overrides: {
            cleanupIds: false,
            removeUnknownsAndDefaults: false,
            removeHiddenElems: false,
            mergePaths: false,
          },
        },
      },
      "sortAttrs",
    ],
  });

  if (typeof result.data !== "string" || result.data.trim().length === 0) {
    throw new Error("SVGO returned empty output.");
  }

  return {
    svg: result.data.trim(),
  };
}

module.exports = {
  optimizeSvg,
};
