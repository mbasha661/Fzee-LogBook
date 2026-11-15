import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createNotificationRouter } from './src/server/notificationApi';
import { GoogleGenAI, Type } from '@google/genai';
import {
  NotificationScheduler,
  type SendFn,
  type SchedulerSettings,
  type SchedulerSnapshot,
} from './src/server/notificationScheduler';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'fzeelogbook-standalone',
      },
    },
  });
}

export async function createApp() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, schedulerEnabled: false }));
  app.use('/api/notifications', createNotificationRouter());
  // Phase 4: Check server-side AI / 3D reconstruction service configuration
  app.get('/api/vehicle-3d/status', (_req, res) => {
    const hasGeminiKey = Boolean(
      process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' &&
        process.env.GEMINI_API_KEY.trim() !== ''
    );
    const hasExternalPhotogrammetry = Boolean(
      process.env.RECONSTRUCTION_3D_API_URL &&
        process.env.RECONSTRUCTION_3D_API_URL.trim() !== ''
    );

    res.json({
      aiCalibrationAvailable: hasGeminiKey,
      externalMeshReconstructionAvailable: hasExternalPhotogrammetry,
      model: hasGeminiKey ? 'gemini-3.8-flash' : null,
      modeDescription: hasExternalPhotogrammetry
        ? 'External 3D Photogrammetry Mesh Service + Gemini Multi-Angle Calibration'
        : hasGeminiKey
        ? 'Gemini Multi-Angle Visual Inspection & Parametric 3D Mesh Calibration (No external NeRF/Photogrammetry endpoint configured)'
        : 'Offline / Standard Three.js GLB & Parametric 3D Viewer (No AI service key configured)',
    });
  });

  // Phase 4: Server-side Multi-Angle Vehicle Inspection & Parametric 3D Calibration
  app.post('/api/vehicle-3d/calibrate', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'AI multi-angle calibration is not configured on this server (GEMINI_API_KEY missing). Standard GLB/glTF loading and 360° turntable viewing remain fully operational.',
        });
        return;
      }

      const {
        registrationNumber,
        make,
        model,
        vehicleType,
        colour,
        photos,
      } = req.body as {
        registrationNumber?: string;
        make?: string;
        model?: string;
        vehicleType?: string;
        colour?: string;
        photos?: Array<{ angleLabel: string; dataUrl: string }>;
      };

      const parts: any[] = [];
      if (Array.isArray(photos)) {
        for (const p of photos.slice(0, 8)) {
          if (typeof p.dataUrl === 'string' && p.dataUrl.startsWith('data:image/')) {
            const match = p.dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
            if (match) {
              parts.push({
                inlineData: {
                  mimeType: match[1],
                  data: match[2],
                },
              });
            }
          }
        }
      }

      parts.push({
        text: `Analyze this commercial/personal fleet vehicle (${registrationNumber || 'Fleet Vehicle'}, ${make || ''} ${model || ''}, listed type: ${vehicleType || 'Sedan'}, listed colour: ${colour || 'White'}) and its uploaded multi-angle photographs (${parts.length} angle image(s) provided).
Return a JSON calibration profile to configure our Three.js multi-part parametric 3D vehicle assembly and exterior inspection summary:
- lengthScale: number between 0.85 and 1.25
- widthScale: number between 0.88 and 1.20
- heightScale: number between 0.85 and 1.30
- rideHeightOffset: number between -0.08 and 0.18
- primaryPaintHex: 7-character hex color string matching the vehicle exterior paint (e.g. "#f8fafc")
- metalness: number between 0.15 and 0.90
- roughness: number between 0.10 and 0.65
- hasRoofCarrierOrBeacon: boolean
- detectedBodyStyle: one of "Sedan", "SUV", "Hatchback", "MPV", "Commercial Van", "Truck"
- inspectionSummary: concise 1-2 sentence exterior condition and proportion note (under 240 chars).`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              lengthScale: { type: Type.NUMBER },
              widthScale: { type: Type.NUMBER },
              heightScale: { type: Type.NUMBER },
              rideHeightOffset: { type: Type.NUMBER },
              primaryPaintHex: { type: Type.STRING },
              metalness: { type: Type.NUMBER },
              roughness: { type: Type.NUMBER },
              hasRoofCarrierOrBeacon: { type: Type.BOOLEAN },
              detectedBodyStyle: { type: Type.STRING },
              inspectionSummary: { type: Type.STRING },
            },
            required: [
              'lengthScale',
              'widthScale',
              'heightScale',
              'rideHeightOffset',
              'primaryPaintHex',
              'metalness',
              'roughness',
              'hasRoofCarrierOrBeacon',
              'detectedBodyStyle',
              'inspectionSummary',
            ],
          },
        },
      });

      const rawText = response.text || '{}';
      const parsed = JSON.parse(rawText);

      const clamp = (val: number, min: number, max: number, fallback: number) =>
        typeof val === 'number' && Number.isFinite(val)
          ? Math.min(max, Math.max(min, Number(val.toFixed(2))))
          : fallback;

      const validBodyStyles = [
        'Sedan',
        'SUV',
        'Hatchback',
        'MPV',
        'Commercial Van',
        'Truck',
      ];

      const calibration = {
        lengthScale: clamp(parsed.lengthScale, 0.85, 1.25, 1.0),
        widthScale: clamp(parsed.widthScale, 0.88, 1.2, 1.0),
        heightScale: clamp(parsed.heightScale, 0.85, 1.3, 1.0),
        rideHeightOffset: clamp(parsed.rideHeightOffset, -0.08, 0.18, 0.0),
        primaryPaintHex:
          typeof parsed.primaryPaintHex === 'string' &&
          /^#[0-9a-fA-F]{6}$/.test(parsed.primaryPaintHex)
            ? parsed.primaryPaintHex
            : '#f8fafc',
        metalness: clamp(parsed.metalness, 0.15, 0.9, 0.55),
        roughness: clamp(parsed.roughness, 0.1, 0.65, 0.22),
        hasRoofCarrierOrBeacon: Boolean(parsed.hasRoofCarrierOrBeacon),
        detectedBodyStyle: validBodyStyles.includes(parsed.detectedBodyStyle)
          ? parsed.detectedBodyStyle
          : vehicleType || 'Sedan',
        inspectionSummary: String(
          parsed.inspectionSummary ||
            'Calibrated 3D proportions and finish from vehicle specifications and angle photos.'
        ).slice(0, 260),
        calibratedAt: new Date().toISOString(),
      };

      res.json({ calibration });
    } catch (err: any) {
      res.status(500).json({
        error:
          err?.message ||
          'Failed to run AI multi-angle 3D calibration on the server.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}
async function startServer() {
  const app = await createApp();
  app.listen(PORT, HOST, () => console.log(`FzeeLog server running on http://${HOST}:${PORT}`));
}
if (!process.env.VERCEL) startServer().catch((err) => { console.error(err); process.exitCode = 1; });
