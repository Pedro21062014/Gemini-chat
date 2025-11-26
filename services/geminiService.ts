import { GoogleGenAI, GenerateContentStreamResult } from "@google/genai";
import { AppMode, ModelId, Attachment } from "../types";

const FILE_SEPARATOR = "___FILE:";

const SYSTEM_INSTRUCTIONS: Record<string, string> = {
  [AppMode.Chat]: `You are Gemini, a helpful, concise, and intelligent AI assistant from Google. 
  - Answer naturally and clearly.
  - If asked about yourself, identify as Gemini.
  - Use Markdown for formatting.
  - You can analyze images if provided.`,
  
  [AppMode.Canvas]: `You are an expert Professional Document Creator and Technical Writer.
  The user needs a high-quality, structured document.

  RULES:
  1. Output strictly formatted Markdown.
  2. Use # H1 for the Main Title.
  3. Use ## H2, ### H3 for sections.
  4. Use Tables to organize data efficiently.
  5. Use Blockquotes (>) for callouts or important notes.
  6. Ensure the tone is professional and the layout is clean.
  7. Do NOT use conversational filler ("Here is your document"). Start directly with the document content.`,
  
  [AppMode.Agent]: `You are an expert Full Stack Web Developer. 
  The user wants you to build a functional application (usually web-based) containing multiple files (HTML, CSS, JS).

  CRITICAL OUTPUT RULES:
  1. Output the code for *multiple files* using a specific separator.
  2. The separator format is exactly: ${FILE_SEPARATOR}<filename>___
  3. Start with the main HTML file (e.g., index.html) if it's a new app.
  4. Follow with CSS and JS files if needed.
  5. Do NOT use markdown code blocks (\`\`\`) to wrap the file content. Output raw code separated by the markers.
  6. Use Tailwind CSS via CDN (<script src="https://cdn.tailwindcss.com"></script>) in index.html.
  7. Do not require external local files (images/assets) unless they are absolute URLs (e.g. placeholder.com).

  UPDATES & EDITS:
  - If the user asks to change or update an existing app, **ONLY output the specific files that need to be changed**.
  - Do NOT output files that have not changed.
  - If you are updating a file, output the *complete* new content of that file, do not output diffs.

  Example Output Structure:
  ${FILE_SEPARATOR}index.html___
  <!DOCTYPE html>...
  ${FILE_SEPARATOR}style.css___
  body { ... }
  ${FILE_SEPARATOR}script.js___
  console.log('test');
  `
};

const getAiClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// --- Text/Chat Streaming ---
export const streamResponse = async (
  modelId: ModelId,
  mode: AppMode,
  history: { role: string; parts: ( { text: string } | { inlineData: { mimeType: string; data: string } } )[] }[],
  message: string,
  attachments: Attachment[],
  useSearch: boolean,
  onChunk: (text: string) => void
): Promise<GenerateContentStreamResult> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing.");
  }

  const ai = getAiClient();
  const systemInstruction = SYSTEM_INSTRUCTIONS[mode] || SYSTEM_INSTRUCTIONS[AppMode.Chat];
  
  // Configure Tools
  const tools = [];
  if (useSearch) {
    tools.push({ googleSearch: {} });
  }

  try {
    const chat = ai.chats.create({
      model: modelId,
      config: {
        systemInstruction,
        temperature: 0.7,
        tools: tools.length > 0 ? tools : undefined,
      },
      history: history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: h.parts
      }))
    });

    const currentParts: any[] = [];
    if (message && message.trim()) {
      currentParts.push({ text: message });
    }
    
    if (attachments && attachments.length > 0) {
      attachments.forEach(att => {
        if (att.type === 'image') {
          const base64Data = att.data.split(',')[1] || att.data;
          currentParts.push({
            inlineData: {
              mimeType: att.mimeType,
              data: base64Data
            }
          });
        }
      });
    }

    if (currentParts.length === 0) {
        currentParts.push({ text: " " });
    }

    const result = await chat.sendMessageStream({ 
      message: currentParts 
    });

    let aggregatedText = '';

    for await (const chunk of result) {
        const text = chunk.text;
        if (text) {
          aggregatedText += text;
          onChunk(aggregatedText);
        }
    }
    
    return result;

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

// --- Image Generation ---
export const generateImage = async (prompt: string): Promise<string> => {
  if (!process.env.API_KEY) throw new Error("API Key missing");
  
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
      // imageConfig: { aspectRatio: "1:1" } 
    }
  });

  if (response.candidates && response.candidates[0].content.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64EncodeString = part.inlineData.data;
        return `data:image/png;base64,${base64EncodeString}`;
      }
    }
  }
  
  throw new Error("No image generated.");
};

// --- Video Generation ---
export const generateVideo = async (prompt: string): Promise<string> => {
  if (!process.env.API_KEY) throw new Error("API Key missing");

  const ai = getAiClient();
  // VEO 3.1
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: prompt,
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9'
    }
  });

  // Polling logic
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
    operation = await ai.operations.getVideosOperation({operation: operation});
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video generation failed: No URI returned.");

  // Fetch with API Key
  const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  if (!response.ok) throw new Error("Failed to download generated video.");
  
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};