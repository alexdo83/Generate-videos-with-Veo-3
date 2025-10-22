/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI } from '@google/genai';

// Fix: Define and use AIStudio interface for window.aistudio to resolve type conflict.
// Define the aistudio property on the window object for TypeScript
declare global {
  interface AIStudio {
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      // Return only the Base64 part of the data URL
      resolve(url.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
}

function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const statusEl = document.querySelector('#status') as HTMLDivElement;

async function generateContent(
  prompt: string,
  imageBytes: string,
  apiKey: string,
  aspectRatio: string,
  durationSeconds: number,
  resolution: string,
  model: string,
) {
  const ai = new GoogleGenAI({ apiKey });

  const params: any = {
    model,
    prompt,
    config: {
      aspectRatio,
      durationSeconds,
      resolution,
      numberOfVideos: 1,
    },
  };

  if (imageBytes) {
    params.image = {
      imageBytes,
      mimeType: 'image/png', // Assuming PNG, adjust if supporting others
    };
  }

  let operation = await ai.models.generateVideos(params);

  let pollCount = 0;
  const maxPolls = 20; // 20 polls * 10s = 200s or ~3.3 minutes timeout
  while (!operation.done && pollCount < maxPolls) {
    pollCount++;
    console.log('Waiting for completion');

    // Calculate and display progress
    const progress = (pollCount / maxPolls) * 100;
    updateProgress(progress, 'Generating...');

    await delay(10000); // Poll every 10 seconds
    try {
      operation = await ai.operations.getVideosOperation({ operation });
    } catch (e) {
      console.error('Error polling for operation status:', e);
      throw new Error(
        'Failed to get video generation status. Please try again.',
      );
    }
  }

  if (!operation.done) {
    throw new Error(
      'Video generation timed out. Please try again with a simpler prompt.',
    );
  }

  updateProgress(100, 'Processing video...');

  const videos = operation.response?.generatedVideos;
  if (videos === undefined || videos.length === 0) {
    throw new Error(
      'No videos were generated. The prompt may have been blocked.',
    );
  }

  // We only expect one video since numberOfVideos is 1
  const firstVideo = videos[0];
  const url = decodeURIComponent(firstVideo.video.uri);
  // Append API key for access
  const res = await fetch(`${url}&key=${apiKey}`);
  const blob = await res.blob();
  const objectURL = URL.createObjectURL(blob);

  // Set the video source and make the container visible
  video.src = objectURL;
  videoContainer.classList.remove('hidden');

  // Store the URL for the download button
  currentVideoUrl = objectURL;
}

// --- DOM Element Selection ---
const apiKeyInput = document.querySelector('#api-key-input') as HTMLInputElement;
const saveApiKeyButton = document.querySelector('#save-api-key-button') as HTMLButtonElement;
const upload = document.querySelector('#file-input') as HTMLInputElement;
const promptEl = document.querySelector('#prompt-input') as HTMLTextAreaElement;
const generateButton = document.querySelector(
  '#generate-button',
) as HTMLButtonElement;
const analyzeButton = document.querySelector(
  '#analyze-button',
) as HTMLButtonElement;
const analysisOutputEl = document.querySelector(
  '#analysis-output',
) as HTMLDivElement;
const videoContainer = document.querySelector(
  '#video-container',
) as HTMLDivElement;
const video = document.querySelector('#video') as HTMLVideoElement;
const downloadButton = document.querySelector(
  '#download-button',
) as HTMLButtonElement;
const fileNameEl = document.querySelector('#file-name') as HTMLSpanElement;
const imgPreview = document.querySelector('#img-preview') as HTMLImageElement;
const aspectRatioSelect = document.querySelector(
  '#aspect-ratio-select',
) as HTMLSelectElement;
const durationInput = document.querySelector(
  '#duration-input',
) as HTMLInputElement;
const resolutionSelect = document.querySelector(
  '#resolution-select',
) as HTMLSelectElement;
const modelSelect = document.querySelector('#model-select') as HTMLSelectElement;
const presetSelect = document.querySelector(
  '#preset-select',
) as HTMLSelectElement;
const progressContainer = document.querySelector(
  '#progress-container',
) as HTMLDivElement;
const progressBar = document.querySelector('#progress-bar') as HTMLDivElement;
const progressLabel = document.querySelector(
  '#progress-label',
) as HTMLSpanElement;
const progressPercent = document.querySelector(
  '#progress-percent',
) as HTMLSpanElement;

// --- State Variables ---
let base64data = '';
let prompt = '';
let aspectRatio = '16:9';
let durationSeconds = 5;
let resolution = '720p';
let selectedModel = 'veo-3.1-fast-generate-preview';
let currentVideoUrl = '';

// --- Presets ---
const PRESETS = {
  cinematic: { aspectRatio: '16:9', duration: 5, resolution: '1080p' },
  animation: { aspectRatio: '1:1', duration: 3, resolution: '720p' },
  product: { aspectRatio: '9:16', duration: 8, resolution: '1080p' },
};

// --- API Key Handling ---
apiKeyInput.value = localStorage.getItem('userApiKey') || '';

saveApiKeyButton.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  localStorage.setItem('userApiKey', key);
  statusEl.innerHTML = `<span class="text-green-400">API Key saved for future sessions.</span>`;
  setTimeout(() => { statusEl.innerText = ''; }, 3000);
});

function getApiKey(): string | null {
  const userKey = localStorage.getItem('userApiKey');
  if (userKey) {
    return userKey;
  }
  // Fallback for environments where process.env is available
  if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
    return process.env.API_KEY;
  }
  return null;
}

// --- Event Listeners ---
upload.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    fileNameEl.textContent = file.name;
    base64data = await blobToBase64(file);
    imgPreview.src = `data:image/png;base64,${base64data}`;
    imgPreview.style.display = 'block';
  } else {
    fileNameEl.textContent = 'No file chosen';
    base64data = '';
    imgPreview.style.display = 'none';
  }
});

promptEl.addEventListener('input', () => {
  prompt = promptEl.value;
});

aspectRatioSelect.addEventListener('change', () => {
  aspectRatio = aspectRatioSelect.value;
});

durationInput.addEventListener('input', () => {
  durationSeconds = parseInt(durationInput.value, 10);
});

resolutionSelect.addEventListener('change', () => {
  resolution = resolutionSelect.value;
});

modelSelect.addEventListener('change', () => {
  selectedModel = modelSelect.value;
});

presetSelect.addEventListener('change', () => {
  applyPreset(presetSelect.value);
});

analyzeButton.addEventListener('click', analyzePrompt);

generateButton.addEventListener('click', () => {
  if (!prompt.trim()) {
    showStatusError('Please enter a prompt to generate a video.');
    return;
  }
  generate();
});

downloadButton.addEventListener('click', () => {
  if (currentVideoUrl) {
    // Sanitize prompt for filename: take first 5 words, replace spaces, remove special chars
    const promptSnippet = prompt
      .trim()
      .split(' ')
      .slice(0, 5)
      .join('_')
      .replace(/[^a-zA-Z0-9_]/g, '');

    // Format aspect ratio for filename
    const formattedAspectRatio = aspectRatio.replace(':', 'x');

    // Create a unique timestamp
    const timestamp = new Date().getTime();

    // Construct the full filename
    const filename = `veo_${promptSnippet}_${formattedAspectRatio}_${timestamp}.mp4`;

    downloadFile(currentVideoUrl, filename);
  }
});

// --- Functions ---
function updateProgress(percentage: number, label: string) {
  const p = Math.min(100, Math.round(percentage));
  progressBar.style.width = `${p}%`;
  progressLabel.innerText = label;
  progressPercent.innerText = `${p}%`;
}

function showStatusError(message: string) {
  progressContainer.classList.add('hidden'); // Ensure progress bar is hidden on error
  statusEl.innerHTML = `<span class="text-red-400">${message}</span>`;
}

function applyPreset(presetKey: string) {
  const isCustom = presetKey === 'custom';

  aspectRatioSelect.disabled = !isCustom;
  durationInput.disabled = !isCustom;
  resolutionSelect.disabled = !isCustom;

  if (!isCustom) {
    const preset = PRESETS[presetKey];
    if (preset) {
      // Update state variables
      aspectRatio = preset.aspectRatio;
      durationSeconds = preset.duration;
      resolution = preset.resolution;

      // Update UI elements
      aspectRatioSelect.value = preset.aspectRatio;
      durationInput.value = preset.duration.toString();
      resolutionSelect.value = preset.resolution;
    }
  } else {
    // If switching to custom, update state from current UI values
    aspectRatio = aspectRatioSelect.value;
    durationSeconds = parseInt(durationInput.value, 10);
    resolution = resolutionSelect.value;
  }
}

function setControlsDisabled(disabled: boolean) {
  generateButton.disabled = disabled;
  analyzeButton.disabled = disabled;
  upload.disabled = disabled;
  promptEl.disabled = disabled;
  modelSelect.disabled = disabled;
  presetSelect.disabled = disabled;
  apiKeyInput.disabled = disabled;
  saveApiKeyButton.disabled = disabled;


  if (disabled) {
    // When disabling all, make sure custom controls are also disabled
    aspectRatioSelect.disabled = true;
    durationInput.disabled = true;
    resolutionSelect.disabled = true;
  } else {
    // When re-enabling, re-apply the preset logic to set correct disabled states
    applyPreset(presetSelect.value);
  }
}

// Simple markdown to HTML renderer
function simpleMarkdownToHtml(md: string): string {
  return md
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
    .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
    .replace(/^\s*[\-\*]\s+(.*)/gm, '<li>$1</li>') // List items
    .replace(/(\<li\>.*\<\/li\>)/gs, '<ul>$1</ul>') // Wrap lists in <ul>
    .replace(/\n/g, '<br>'); // Newlines
}

async function analyzePrompt() {
  const userPrompt = promptEl.value.trim();
  const apiKey = getApiKey();

  if (!apiKey) {
    showStatusError('Please provide an API key above to analyze the prompt.');
    return;
  }

  if (!userPrompt) {
    analysisOutputEl.innerHTML = `<span class="text-yellow-400">Please enter a prompt to analyze.</span>`;
    analysisOutputEl.classList.remove('hidden');
    return;
  }

  analyzeButton.disabled = true;
  analysisOutputEl.classList.remove('hidden');
  analysisOutputEl.innerHTML = `<span class="text-gray-400">Analyzing prompt with Gemini Pro...</span>`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const analysisMetaPrompt = `
      You are an expert prompt engineer for a text-to-video AI model.
      Your task is to analyze the following user's prompt.

      Analyze the prompt for:
      - Clarity and specificity.
      - Potential for visual ambiguity.
      - Action, characters, and setting.

      Provide a concise summary of the prompt's intent. Then, if applicable, suggest 1-2 improvements to make the prompt more effective for generating a high-quality video.
      Keep your entire response under 80 words. Format your response in simple Markdown.

      User's prompt: "${userPrompt}"
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: analysisMetaPrompt,
    });

    const analysisText = response.text;
    analysisOutputEl.innerHTML = simpleMarkdownToHtml(analysisText);
  } catch (e) {
    console.error('Prompt analysis failed:', e);
    const errorMessage =
      e instanceof Error ? e.message : 'An unknown error occurred.';
    let userFriendlyMessage = `Error during analysis: ${errorMessage}`;

    if (
      typeof errorMessage === 'string' &&
      (errorMessage.includes('API_KEY_INVALID') ||
        errorMessage.includes('API key not valid'))
    ) {
      userFriendlyMessage =
        'The provided API key is invalid. Please enter a valid key above.';
    }

    analysisOutputEl.innerHTML = `<span class="text-red-400">${userFriendlyMessage}</span>`;
  } finally {
    analyzeButton.disabled = false;
  }
}

async function generate() {
  const apiKey = getApiKey();

  if (!apiKey) {
    showStatusError('Please enter and save your API key above to generate a video.');
    return;
  }

  // Hide status text, show progress bar and reset it
  statusEl.innerText = '';
  progressContainer.classList.remove('hidden');
  updateProgress(0, 'Initializing...');

  videoContainer.classList.add('hidden');
  analysisOutputEl.classList.add('hidden'); // Hide analysis during generation
  setControlsDisabled(true);

  try {
    await generateContent(
      prompt,
      base64data,
      apiKey,
      aspectRatio,
      durationSeconds,
      resolution,
      selectedModel,
    );
    progressContainer.classList.add('hidden');
    statusEl.innerText = 'Video generated successfully.';
  } catch (e) {
    progressContainer.classList.add('hidden');
    console.error('Video generation failed:', e);
    const errorMessage =
      e instanceof Error ? e.message : 'An unknown error occurred.';

    let userFriendlyMessage = `Video generation failed: ${errorMessage}`;

    if (typeof errorMessage === 'string') {
      if (
        errorMessage.includes('API_KEY_INVALID') ||
        errorMessage.includes('API key not valid')
      ) {
        userFriendlyMessage =
          '<strong>Error: Invalid API Key.</strong><br>Please double-check the API key you entered in the field above and save it again.';
      } else if (errorMessage.toLowerCase().includes('permission denied')) {
        userFriendlyMessage =
          '<strong>Error: Permission Denied.</strong><br>Your key seems valid, but the project it belongs to may not have the Veo API enabled or billing set up. Please <a href="https://console.cloud.google.com/" target="_blank" class="text-blue-400 hover:underline">check your Google Cloud project settings</a>.';
      } else if (errorMessage.includes('Requested entity was not found.')) {
        userFriendlyMessage =
          "<strong>Error: Model not found.</strong><br>This usually happens if your API key's project does not have the Veo API enabled. Please verify your project settings.";
      } else if (errorMessage.includes('timed out')) {
        userFriendlyMessage = `<strong>Error: Request timed out.</strong><br>The video generation took too long. Please try again with a simpler prompt or a shorter duration.`;
      }
    }
    showStatusError(userFriendlyMessage);
  } finally {
    setControlsDisabled(false);
  }
}

// Initialize the UI with the default preset
applyPreset(presetSelect.value);