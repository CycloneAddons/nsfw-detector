const express = require("express");
const axios = require("axios");
const sharp = require("sharp");
const tf = require("@tensorflow/tfjs-node");
const nsfwjs = require("nsfwjs");
const gifFrames = require("gif-frames");
const { fileTypeFromBuffer } = require("file-type");
const { default: pLimit } = require("p-limit");
const { getDirectUrl } = require("./a");
const app = express();

app.use(express.json({
  limit: "1mb"
}));

let model;
 
function getRiskLevel(score) {
  if (score >= 0.90) return "VERY_HIGH";
  if (score >= 0.70) return "HIGH";
  if (score >= 0.40) return "MEDIUM";
  if (score >= 0.15) return "LOW";
  return "SAFE";
}

async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    stream.on("data", chunk => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function classifyBuffer(buffer) {
  const resized = await sharp(buffer)
    .resize(224, 224, {
      fit: "cover"
    })
    .jpeg()
    .toBuffer();

  const tensor = tf.node.decodeImage(resized, 3);

  try {
    return await model.classify(tensor);
  } finally {
    tensor.dispose();
  }
}

function predictionsToCategories(predictions) {
  const categories = {
    porn: 0,
    sexy: 0,
    hentai: 0,
    neutral: 0,
    drawing: 0
  };

  for (const pred of predictions) {
    categories[pred.className.toLowerCase()] =
      Number(pred.probability.toFixed(4));
  }

  return categories;
}

async function scanImage(buffer) {
  const predictions = await classifyBuffer(buffer);

  const categories =
    predictionsToCategories(predictions);

  const nsfwScore = Math.max(
    categories.porn,
    categories.sexy,
    categories.hentai
  );

  return {
    type: "image",
    safe: nsfwScore < 0.70,
    nsfw_score: Number(nsfwScore.toFixed(4)),
    risk_level: getRiskLevel(nsfwScore),
    categories
  };
}

async function scanGif(buffer) {
  const frames = await gifFrames({
    url: buffer,
    frames: "all",
    outputType: "png",
    cumulative: true
  });

  const maxFrames = 10;

  const step = Math.max(
    1,
    Math.floor(frames.length / maxFrames)
  );

  const selectedFrames = [];

  for (let i = 0; i < frames.length; i += step) {
    selectedFrames.push(frames[i]);

    if (selectedFrames.length >= maxFrames)
      break;
  }

  const limit = pLimit(4);

  const results = await Promise.all(
    selectedFrames.map(frame =>
      limit(async () => {
        const pngBuffer =
          await streamToBuffer(
            frame.getImage()
          );

        return classifyBuffer(pngBuffer);
      })
    )
  );

  const categories = {
    porn: 0,
    sexy: 0,
    hentai: 0,
    neutral: 0,
    drawing: 0
  };

  for (const prediction of results) {
    for (const item of prediction) {
      const key =
        item.className.toLowerCase();

      categories[key] = Math.max(
        categories[key] || 0,
        item.probability
      );
    }
  }

  Object.keys(categories).forEach(key => {
    categories[key] = Number(
      categories[key].toFixed(4)
    );
  });

  const nsfwScore = Math.max(
    categories.porn,
    categories.sexy,
    categories.hentai
  );

  return {
    type: "gif",
    safe: nsfwScore < 0.70,
    nsfw_score: Number(nsfwScore.toFixed(4)),
    risk_level: getRiskLevel(nsfwScore),
    scanned_frames: selectedFrames.length,
    total_frames: frames.length,
    categories
  };
}

app.post("/scan", async (req, res) => {
  const started = Date.now();

  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: "URL required"
      });
    }

    const resolved = await getDirectUrl(url);

    if (!resolved?.url && !resolved?.buffer) {
      return res.status(400).json({
        success: false,
        message: "Unable to resolve media URL"
      });
    }

    let buffer;

    if (resolved.buffer) {
      buffer = resolved.buffer;
    } else {
      const response = await axios.get(resolved.url, {
        responseType: "arraybuffer",
        timeout: 15000,
        maxContentLength: 20 * 1024 * 1024,
        headers: {
          "User-Agent": "Mozilla/5.0"
        }
      });

      buffer = Buffer.from(response.data);
    }

    const file = await fileTypeFromBuffer(buffer);

    if (!file) {
      throw new Error("Unable to determine file type");
    }

    if (!file.mime.startsWith("image/")) {
      throw new Error(`Unsupported file type: ${file.mime}`);
    }

    let result;

    if (file?.mime === "image/gif") {
      result = await scanGif(buffer);
    } else {
      result = await scanImage(buffer);
    }

    res.json({
      success: true,
      url,
      resolved_url: resolved.url || url,
      provider: resolved.provider || null,
      processing_time_ms:
        Date.now() - started,
      ...result
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

(async () => {
  console.log("Loading NSFW model...");

  model = await nsfwjs.load(`https://raw.githubusercontent.com/infinitered/nsfwjs/refs/heads/master/models/inception_v3/`, { size: 299 });

  console.log("NSFW model loaded");

  app.listen(9099, () => {
    console.log(
      "NSFW API listening on :3000"
    );
  });
})();