
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';

// --- SETUP ---
const app = express();

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase payload limit for base64 images
const upload = multer({ storage: multer.memoryStorage() }); // For handling file uploads in memory

// --- HEALTH CHECK ---
app.get('/v1/cool-shot/health-check', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// --- API ROUTES ---

// Generic handler for all text-based prompts
app.post('/v1/cool-shot/text-prompt', async (req, res) => {
  if (!process.env.API_KEY) return res.status(500).json({ error: 'API_KEY not configured on server.' });
  const { model, fullPrompt } = req.body;
  if (!model || !fullPrompt) {
    return res.status(400).json({ error: 'Model and fullPrompt are required.' });
  }

  console.log(`[Text Prompt] Calling model ${model}...`);
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: fullPrompt,
    });
    console.log(`[Text Prompt] Success.`);
    res.json({ result: response.text });
  } catch (error) {
    console.error('[Text Prompt] Error:', error);
    res.status(500).json({ error: `Failed to get response from Gemini. ${error.message}` });
  }
});

// Handler for image generation
app.post('/v1/cool-shot/generate-image', async (req, res) => {
  if (!process.env.API_KEY) return res.status(500).json({ error: 'API_KEY not configured on server.' });
  const { model, prompt } = req.body;
  if (!model || !prompt) {
    return res.status(400).json({ error: 'Model and prompt are required.' });
  }

  console.log(`[Image Gen] Calling model ${model}...`);
  try {
    const response = await ai.models.generateImages({
      model: model,
      prompt: prompt,
      config: { numberOfImages: 1, outputMimeType: 'image/png' },
    });
    const base64ImageBytes = response.generatedImages[0].image.imageBytes;
    const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
    console.log(`[Image Gen] Success.`);
    res.json({ imageUrl });
  } catch (error) {
    console.error('[Image Gen] Error:', error);
    res.status(500).json({ error: `Failed to generate image. ${error.message}` });
  }
});

// Handler for analyzing uploaded images
app.post('/v1/cool-shot/analyze-image', upload.single('image'), async (req, res) => {
    if (!process.env.API_KEY) return res.status(500).json({ error: 'API_KEY not configured on server.' });
    const { model, prompt } = req.body;
    const imageFile = req.file;

    if (!model || !imageFile) {
        return res.status(400).json({ error: 'Model and an image file are required.' });
    }

    console.log(`[Image Analysis] Calling model ${model}...`);
    try {
        const imagePart = {
            inlineData: {
                data: imageFile.buffer.toString('base64'),
                mimeType: imageFile.mimetype,
            },
        };
        const textPart = { text: prompt || "Describe this image in detail." };
        
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: [imagePart, textPart] }
        });

        console.log(`[Image Analysis] Success.`);
        res.json({ result: response.text });
    } catch (error) {
        console.error('[Image Analysis] Error:', error);
        res.status(500).json({ error: `Failed to analyze image. ${error.message}` });
    }
});


// --- VIDEO GENERATION ROUTES ---
// This stateless approach is required for serverless environments like Vercel.

// 1. Start video generation
app.post('/v1/cool-shot/generate-video', async (req, res) => {
    if (!process.env.API_KEY) return res.status(500).json({ error: 'API_KEY not configured on server.' });
    const { model, prompt } = req.body;
    if (!model || !prompt) {
        return res.status(400).json({ error: 'Model and prompt are required.' });
    }

    console.log(`[Video Gen] Starting generation for model ${model}...`);
    try {
        const operation = await ai.models.generateVideos({
            model: model,
            prompt: prompt,
            config: { numberOfVideos: 1 }
        });
        
        console.log(`[Video Gen] Operation started: ${operation.name}`);
        res.status(202).json({ operation }); // 202 Accepted
    } catch (error) {
        console.error('[Video Gen] Error:', error);
        res.status(500).json({ error: `Failed to start video generation. ${error.message}` });
    }
});

// 2. Poll for video status
app.post('/v1/cool-shot/video-status', async (req, res) => {
    if (!process.env.API_KEY) return res.status(500).json({ error: 'API_KEY not configured on server.' });
    let { operation } = req.body;

    if (!operation || !operation.name) {
        return res.status(400).json({ error: 'A valid operation object is required.' });
    }

    console.log(`[Video Status] Polling for operation: ${operation.name}`);
    try {
        if (!operation.done) {
            operation = await ai.operations.getVideosOperation({ operation: operation });
        }

        if (operation.done) {
            console.log(`[Video Status] Operation ${operation.name} is done.`);
            const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
            if (downloadLink) {
                const videoUrl = `${downloadLink}&key=${process.env.API_KEY}`;
                res.json({ status: 'done', videoUrl, operation });
            } else {
                 res.json({ status: 'failed', error: 'Video generation finished but no URI was returned.', operation });
            }
        } else {
            console.log(`[Video Status] Operation ${operation.name} is still processing.`);
            res.json({ status: 'processing', operation });
        }
    } catch (error) {
        console.error(`[Video Status] Error polling ${operation.name}:`, error);
        res.status(500).json({ status: 'failed', error: `Failed to poll video status. ${error.message}` });
    }
});


// Export the Express API for Vercel
export default app;
