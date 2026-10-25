import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const PORT = 3000;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

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

  // Phase 5: Server-side Compliance & Preventive Maintenance Digest Generator
  app.post('/api/notifications/digest', (req, res) => {
    try {
      const {
        businessName,
        recipientEmail,
        alertsCount,
        criticalCount,
        warningCount,
        topAlerts,
        alerts,
        fleetNetEarnings,
        financialSummary,
      } = req.body as {
        businessName?: string;
        recipientEmail?: string;
        alertsCount?: number;
        criticalCount?: number;
        warningCount?: number;
        topAlerts?: Array<{ title: string; detail: string; severity: string }>;
        alerts?: Array<{
          severity: string;
          targetLabel: string;
          documentLabel: string;
          expiryOrDueInfo: string;
        }>;
        fleetNetEarnings?: number;
        financialSummary?: {
          totalKm: number;
          grossEarnings: number;
          totalOperatingExpenses: number;
          totalDriverShare: number;
          netBusinessEarnings: number;
        };
      };

      const targetEmail = (recipientEmail || '').trim();
      if (!targetEmail) {
        res.status(400).json({
          error: 'recipientEmail is required to generate an alert digest.',
        });
        return;
      }
      const kolkataTime = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short',
      });

      const incomingAlerts = Array.isArray(alerts) ? alerts : [];
      const computedCrit =
        criticalCount ??
        incomingAlerts.filter(
          (a) =>
            a.severity === 'EXPIRED' ||
            a.severity === 'URGENT' ||
            a.severity === 'CRITICAL'
        ).length;
      const computedWarn =
        warningCount ??
        incomingAlerts.filter((a) => a.severity === 'WARNING').length;
      const totalAlerts = alertsCount ?? incomingAlerts.length;

      const netVal = Number(
        financialSummary?.netBusinessEarnings ?? fleetNetEarnings ?? 0
      );

      const formattedAlertLines =
        incomingAlerts.length > 0
          ? incomingAlerts
              .slice(0, 12)
              .map(
                (a, idx) =>
                  `  ${idx + 1}. [${a.severity}] ${a.targetLabel} — ${a.documentLabel} (${a.expiryOrDueInfo})`
              )
              .join('\n')
          : (topAlerts || [])
              .slice(0, 8)
              .map(
                (a, idx) => `  ${idx + 1}. [${a.severity}] ${a.title} (${a.detail})`
              )
              .join('\n') || '  • All fleet vehicles and driver licenses are compliant.';

      const digestSubject = `FzeeLog Alert & Financial Digest — ${businessName || 'FzeeLog Fleet'} (${totalAlerts} Active Alerts)`;
      const bodyText = [
        `====================================================================`,
        `FZEELOG — DAILY COMPLIANCE, MAINTENANCE & FINANCIAL DIGEST`,
        `====================================================================`,
        `Business Name      : ${businessName || 'FzeeLog Fleet Operations'}`,
        `Target Account     : ${targetEmail}`,
        `Generated (IST)    : ${kolkataTime} (Asia/Kolkata)`,
        `Currency / Distance: INR (₹) / Kilometres (km)`,
        `--------------------------------------------------------------------`,
        `1. FINANCIAL & SHIFT SUMMARY (DRIVER SHARE KEPT SEPARATE FROM OPEX)`,
        `   • Total Distance Driven     : ${Number(financialSummary?.totalKm ?? 0).toFixed(1)} km`,
        `   • Gross Shift Earnings      : ₹${Number(financialSummary?.grossEarnings ?? 0).toFixed(2)}`,
        `   • Driver Share (Separated)  : ₹${Number(financialSummary?.totalDriverShare ?? 0).toFixed(2)}`,
        `   • Operating Expenses (OpEx) : ₹${Number(financialSummary?.totalOperatingExpenses ?? 0).toFixed(2)}`,
        `   • Net Business Surplus      : ₹${netVal.toFixed(2)}`,
        `--------------------------------------------------------------------`,
        `2. STATUTORY EXPIRY & PREVENTIVE SERVICE ALERTS (${totalAlerts} Total | ${computedCrit} Critical/Urgent | ${computedWarn} Warning)`,
        formattedAlertLines,
        `====================================================================`,
      ].join('\n');

      const shortMessage = `Prepared at ${kolkataTime} (Asia/Kolkata) for ${businessName || 'FzeeLog Fleet'} -> ${targetEmail}. Critical/Expired: ${computedCrit}, Warnings: ${computedWarn}. Net Surplus: Rs.${netVal.toFixed(2)}.`.slice(
        0,
        790
      );

      res.json({
        dispatchedAt: new Date().toISOString(),
        recipientEmail: targetEmail,
        title: digestSubject.slice(0, 160),
        message: shortMessage,
        digest: {
          subject: digestSubject,
          bodyText,
          recipientEmail: targetEmail,
          generatedAtKolkata: kolkataTime,
          criticalCount: computedCrit,
          warningCount: computedWarn,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        error: err?.message || 'Failed to generate fleet alert digest.',
      });
    }
  });

  // 10-Day, 5-Day & 1-Day Statutory Expiry Alert Test Trigger (Email + WhatsApp)
  app.post('/api/notifications/test-dispatch', async (req, res) => {
    try {
      const {
        businessName,
        accountMode,
        recipientEmail,
        whatsappNumber,
        channel,
        milestonesDays,
        statutoryItems,
      } = req.body as {
        businessName?: string;
        accountMode?: string;
        recipientEmail?: string;
        whatsappNumber?: string;
        channel?: 'email' | 'whatsapp' | 'both';
        milestonesDays?: number[];
        statutoryItems?: Array<{
          category: string;
          entityLabel: string;
          documentNumber: string;
          expiryDate: string;
          daysRemaining: number;
          milestoneStage: string;
        }>;
      };

      const targetEmail = (recipientEmail || '').trim();
      const rawPhone = (whatsappNumber || '').replace(/\D/g, '');
      const normalizedChannel = (channel || 'both').toLowerCase();
      if (!targetEmail) {
        res.status(400).json({
          error: 'recipientEmail is required for a test dispatch.',
        });
        return;
      }
      if (
        (normalizedChannel === 'whatsapp' || normalizedChannel === 'both') &&
        !rawPhone
      ) {
        res.status(400).json({
          error: 'whatsappNumber is required for WhatsApp test dispatch.',
        });
        return;
      }
      const normalizedWaPhone =
        rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
      const displayWaPhone = normalizedWaPhone
        ? `+${normalizedWaPhone.slice(0, 2)} ${normalizedWaPhone.slice(2)}`
        : 'not provided';
      const activeMilestones =
        Array.isArray(milestonesDays) && milestonesDays.length > 0
          ? milestonesDays.join(' Days, ') + ' Day(s)'
          : '10 Days, 5 Days, 1 Day';

      const kolkataTime = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'medium',
      });

      const items = Array.isArray(statutoryItems) ? statutoryItems : [];
      const sampleOrLiveLines =
        items.length > 0
          ? items
              .slice(0, 10)
              .map(
                (item, idx) =>
                  `${idx + 1}. [${item.milestoneStage}] ${item.category} — ${item.entityLabel} | Doc: ${item.documentNumber} | Expiry: ${item.expiryDate} (${item.daysRemaining}d)`
              )
              .join('\n')
          : [
              `1. [10-DAY ALERT] Insurance — TN-38-CZ-4512 | Policy Expiry in 10 Days`,
              `2. [5-DAY ALERT] Fitness Certificate (FC) — TN-37-DX-8901 | FC Expiry in 5 Days`,
              `3. [5-DAY ALERT] Permit — TN-38-CZ-4512 | Commercial Permit Expiry in 5 Days`,
              `4. [1-DAY ALERT] Driver Licence — Karthikayan V. | DL Expiry in 1 Day`,
              `5. [1-DAY ALERT] Pollution (PUCC) — TN-66-AF-2319 | PUCC Expiry in 1 Day`,
            ].join('\n');

      const emailSubject = `[FzeeLog TEST ALERT] 10d / 5d / 1d Expiry Reminder (Insurance, FC, Permit, DL, Pollution) — ${businessName || 'FzeeLog Fleet'}`;
      const emailBody = [
        `FZEELOG STATUTORY EXPIRY ALERT TEST DISPATCH (10 DAYS / 5 DAYS / 1 DAY)`,
        `========================================================================`,
        `Organization / Account : ${businessName || 'FzeeLog Fleet Operations'} (${accountMode || 'Organization'})`,
        `Recipient Email ID     : ${targetEmail}`,
        `WhatsApp Alert Number  : ${displayWaPhone} (${rawPhone || 'not provided'})`,
        `Trigger Schedule       : Before ${activeMilestones} of Expiry`,
        `Monitored Categories   : Insurance, Fitness Certificate (FC), Permit, Driver Licence, Pollution (PUCC)`,
        `Dispatched Timestamp   : ${kolkataTime} IST (Asia/Kolkata)`,
        `------------------------------------------------------------------------`,
        `STATUTORY COMPLIANCE SCHEDULE & MILESTONE STATUS:`,
        sampleOrLiveLines,
        `========================================================================`,
        `Automated FzeeLog Compliance Engine · INR (₹) · km · Asia/Kolkata`,
      ].join('\n');

      const whatsappText = [
        `*FzeeLog Statutory Expiry Alert Test*`,
        `🏢 *Account:* ${businessName || 'FzeeLog Fleet'} (${accountMode || 'Organization'})`,
        `📧 *Email:* ${targetEmail}`,
        `📱 *WhatsApp:* ${displayWaPhone}`,
        `⏰ *Schedule:* 10 Days, 5 Days & 1 Day Before Expiry`,
        `📋 *Categories:* Insurance, FC, Permit, Driver Licence & Pollution`,
        `--------------------------------`,
        sampleOrLiveLines,
        `--------------------------------`,
        `🕒 _Tested at ${kolkataTime} IST_`,
      ].join('\n');

      // Optional Meta WhatsApp Cloud API live call if configured in environment
      let cloudApiDispatched = false;
      if (
        (normalizedChannel === 'whatsapp' || normalizedChannel === 'both') &&
        process.env.WHATSAPP_CLOUD_API_TOKEN &&
        process.env.WHATSAPP_PHONE_NUMBER_ID
      ) {
        try {
          const waRes = await fetch(
            `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_API_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: normalizedWaPhone,
                type: 'text',
                text: { body: whatsappText },
              }),
            }
          );
          cloudApiDispatched = waRes.ok;
        } catch {
          cloudApiDispatched = false;
        }
      }

      const mailtoUrl = `mailto:${encodeURIComponent(targetEmail)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
      const whatsappUrl = `https://wa.me/${normalizedWaPhone}?text=${encodeURIComponent(whatsappText)}`;

      res.json({
        ok: true,
        channel: normalizedChannel,
        dispatchedAt: new Date().toISOString(),
        dispatchedAtKolkata: kolkataTime,
        targetEmail,
        targetWhatsapp: rawPhone,
        normalizedWhatsapp: normalizedWaPhone,
        displayWhatsapp: displayWaPhone,
        cloudApiDispatched,
        emailPayload: {
          to: targetEmail,
          subject: emailSubject,
          body: emailBody,
          mailtoUrl,
        },
        whatsappPayload: {
          to: normalizedWaPhone,
          text: whatsappText,
          whatsappUrl,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        error:
          err?.message ||
          'Failed to trigger test email and WhatsApp expiry dispatch.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FzeeLog full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
