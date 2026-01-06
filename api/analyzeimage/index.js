const axios = require('axios');

module.exports = async function (context, req) {
  const visionEndpoint = process.env.CONTENT_SAFETY_ENDPOINT;
  const visionKey = process.env.CONTENT_SAFETY_KEY;

  if (!visionEndpoint || !visionKey) {
    context.res = {
      status: 500,
      body: { error: 'Azure Computer Vision endpoint or key not configured.' }
    };
    return;
  }

  // Accepts image as base64 or as a URL
  const { imageBase64, imageUrl } = req.body || {};
  let imageContent;
  let contentType;

  if (imageBase64) {
    imageContent = Buffer.from(imageBase64, 'base64');
    contentType = 'application/octet-stream';
  } else if (imageUrl) {
    imageContent = { url: imageUrl };
    contentType = 'application/json';
  } else {
    context.res = {
      status: 400,
      body: { error: 'No image provided.' }
    };
    return;
  }

  try {
    const url = `${visionEndpoint}/vision/v3.2/analyze?visualFeatures=Tags,Description,Objects,Categories`;
    const headers = {
      'Ocp-Apim-Subscription-Key': visionKey,
      'Content-Type': contentType
    };
    const response = await axios.post(url, imageContent, { headers });
    context.res = {
      status: 200,
      body: response.data
    };
  } catch (err) {
    context.res = {
      status: 500,
      body: { error: 'Vision API error', details: err && err.response && err.response.data ? err.response.data : err.message }
    };
  }
};
