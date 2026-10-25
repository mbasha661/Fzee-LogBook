/**
 * FzeeLogBook server-side notification scheduler.
 *
 * Runs scheduled jobs for:
 *  - Daily logbook summary (all 15 logbook fields, current KM, next service
 *    date/KM per vehicle)
 *  - Service reminders (date/KM based)
 *  - Statutory expiry reminders (FC / Insurance / Permit / Pollution / DL) at
 *    configurable reminder intervals
 *
 * Delivery rules:
 *  - Official WhatsApp Cloud API and SMTP only. Personal WhatsApp Web is
 *    never automated.
 *  - Owner consent is required before any live dispatch.
 *  - Every dispatch attempt is deduplicated, retried with backoff, and
 *    written to the delivery log. A dispatch that cannot be sent is logged
 *    as SKIPPED or FAILED - never reported as sent.
 */

export type NotificationChannel = 'email' | 'whatsapp' | 'both';

export interface SchedulerSettings {
  enabled: boolean;
  /** Explicit owner consent timestamp (ISO). No consent, no dispatch. */
  consentGivenAt?: string;
  channel: NotificationChannel;
  recipientEmail?: string;
  whatsappNumber?: string;
  dailySummaryEnabled: boolean;
  /** Daily summary wall-clock time in Asia/Kolkata, "HH:MM". */
  dailySummaryTimeKolkata: string;
  expiryReminderEnabled: boolean;
  /** Reminder intervals in days before expiry, e.g. [10, 5, 1]. */
  reminderIntervalDays: number[];
  serviceReminderEnabled: boolean;
}

export interface SchedulerVehicle {
  id: string;
  registrationNumber: string;
  currentOdometerKm: number;
  nextServiceDate?: string;
  nextServiceOdometerKm?: number;
}

export interface SchedulerLogbookEntry {
  vehicleId: string;
  date: string; // YYYY-MM-DD
  startingKm: number;
  endingKm: number;
  kmDay: number;
  attendance: string;
  earnings: number;
  unitPrice: number;
  driverShare: number;
  gasFuel: number;
  redTaxi: number;
  toll: number;
  maintenance: number;
  totalExpenses: number;
  netBusinessEarnings: number;
  sourceRemarks: string;
}

export interface SchedulerComplianceItem {
  id: string;
  category: string; // Insurance | Fitness Certificate (FC) | Permit | ...
  entityLabel: string;
  expiryDate: string; // YYYY-MM-DD
}

export interface SchedulerSnapshot {
  businessName: string;
  vehicles: SchedulerVehicle[];
  logbookEntries: SchedulerLogbookEntry[];
  complianceItems: SchedulerComplianceItem[];
  updatedAt: string;
}

export type DeliveryStatus = 'SENT' | 'FAILED' | 'SKIPPED';

export interface DeliveryLogEntry {
  id: string;
  dedupeKey: string;
  jobType: 'DAILY_SUMMARY' | 'EXPIRY_REMINDER' | 'SERVICE_REMINDER';
  channel: 'email' | 'whatsapp';
  recipient: string;
  status: DeliveryStatus;
  attempts: number;
  detail: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SenderResult {
  ok: boolean;
  error?: string;
  /** True when the channel has no credentials configured (SKIPPED). */
  notConfigured?: boolean;
}

export type SendFn = (
  channel: 'email' | 'whatsapp',
  recipient: string,
  subject: string,
  body: string
) => Promise<SenderResult>;

export const DEFAULT_SETTINGS: SchedulerSettings = {
  enabled: false,
  channel: 'both',
  dailySummaryEnabled: true,
  dailySummaryTimeKolkata: '21:00',
  expiryReminderEnabled: true,
  reminderIntervalDays: [10, 5, 1],
  serviceReminderEnabled: true,
};

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [60_000, 300_000, 900_000];

export function kolkataToday(now: Date): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function kolkataHHMM(now: Date): string {
  const parts = now.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  return parts.slice(0, 5);
}

export function buildDailySummaryBody(
  date: string,
  businessName: string,
  vehicles: SchedulerVehicle[],
  entries: SchedulerLogbookEntry[]
): string {
  const lines: string[] = [
    `*FzeeLogBook Daily Summary - ${date}*`,
    `Account: ${businessName}`,
    `--------------------------------`,
  ];
  const dayEntries = entries.filter((e) => e.date === date);
  if (dayEntries.length === 0) {
    lines.push('No logbook entries recorded today.');
  }
  for (const e of dayEntries) {
    const veh = vehicles.find((v) => v.id === e.vehicleId);
    lines.push(
      [
        `Vehicle: ${veh?.registrationNumber || e.vehicleId}`,
        `Date: ${e.date} | Attendance: ${e.attendance}`,
        `Starting KM: ${e.startingKm} | Ending KM: ${e.endingKm} | KM/DAY: ${e.kmDay}`,
        `Earnings: Rs.${e.earnings.toFixed(2)} | Unit Price: Rs.${e.unitPrice.toFixed(2)}`,
        `Driver Share: Rs.${e.driverShare.toFixed(2)} | Gas/Fuel: Rs.${e.gasFuel.toFixed(2)} | Red Taxi: Rs.${e.redTaxi.toFixed(2)}`,
        `Toll: Rs.${e.toll.toFixed(2)} | Maintenance: Rs.${e.maintenance.toFixed(2)}`,
        `Total Expenses: Rs.${e.totalExpenses.toFixed(2)} | Net Earnings: Rs.${e.netBusinessEarnings.toFixed(2)}`,
        e.sourceRemarks ? `Remarks: ${e.sourceRemarks}` : '',
        `Current KM: ${veh?.currentOdometerKm ?? 'n/a'} | Next Service: ${veh?.nextServiceDate || 'n/a'} / ${veh?.nextServiceOdometerKm ?? 'n/a'} km`,
      ]
        .filter(Boolean)
        .join('\n'),
      `--------------------------------`
    );
  }
  return lines.join('\n');
}

export class NotificationScheduler {
  private settings: SchedulerSettings = { ...DEFAULT_SETTINGS };
  private snapshot: SchedulerSnapshot | null = null;
  private log: DeliveryLogEntry[] = [];
  private pendingRetries: Map<string, { nextAttemptAt: number }> = new Map();
  private seq = 0;

  constructor(
    private send: SendFn,
    private now: () => Date = () => new Date()
  ) {}

  updateSettings(s: Partial<SchedulerSettings>): SchedulerSettings {
    this.settings = { ...this.settings, ...s };
    return this.settings;
  }

  getSettings(): SchedulerSettings {
    return { ...this.settings };
  }

  updateSnapshot(s: SchedulerSnapshot): void {
    this.snapshot = s;
  }

  getDeliveryLog(): DeliveryLogEntry[] {
    return [...this.log].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** One scheduler cycle. Safe to call every minute. */
  async tick(): Promise<void> {
    const now = this.now();
    await this.flushRetries(now);
    const s = this.settings;
    if (!s.enabled) return;
    if (!this.snapshot) return;

    const today = kolkataToday(now);
    if (
      s.dailySummaryEnabled &&
      kolkataHHMM(now) >= s.dailySummaryTimeKolkata
    ) {
      await this.dispatch(
        `daily:${today}`,
        'DAILY_SUMMARY',
        `FzeeLogBook Daily Summary - ${today}`,
        buildDailySummaryBody(
          today,
          this.snapshot.businessName,
          this.snapshot.vehicles,
          this.snapshot.logbookEntries
        )
      );
    }

    if (s.expiryReminderEnabled) {
      for (const item of this.snapshot.complianceItems) {
        const daysLeft = Math.round(
          (Date.parse(item.expiryDate) - Date.parse(today)) / 86_400_000
        );
        if (!s.reminderIntervalDays.includes(daysLeft)) continue;
        await this.dispatch(
          `expiry:${item.id}:${item.expiryDate}:${daysLeft}d`,
          'EXPIRY_REMINDER',
          `Expiry reminder: ${item.category} - ${item.entityLabel}`,
          `*FzeeLogBook Expiry Reminder*\n${item.category} for ${item.entityLabel} expires on ${item.expiryDate} (${daysLeft} day(s) left).`
        );
      }
    }

    if (s.serviceReminderEnabled) {
      for (const v of this.snapshot.vehicles) {
        if (v.nextServiceOdometerKm !== undefined) {
          const kmLeft = v.nextServiceOdometerKm - v.currentOdometerKm;
          if (kmLeft <= 500) {
            await this.dispatch(
              `service-km:${v.id}:${v.nextServiceOdometerKm}`,
              'SERVICE_REMINDER',
              `Service due by KM: ${v.registrationNumber}`,
              `*FzeeLogBook Service Reminder*\n${v.registrationNumber} is ${Math.max(0, kmLeft)} km from its next service at ${v.nextServiceOdometerKm} km (current: ${v.currentOdometerKm} km).`
            );
          }
        }
        if (v.nextServiceDate) {
          const daysLeft = Math.round(
            (Date.parse(v.nextServiceDate) - Date.parse(today)) / 86_400_000
          );
          if (daysLeft >= 0 && daysLeft <= 7) {
            await this.dispatch(
              `service-date:${v.id}:${v.nextServiceDate}`,
              'SERVICE_REMINDER',
              `Service due by date: ${v.registrationNumber}`,
              `*FzeeLogBook Service Reminder*\n${v.registrationNumber} is due for service on ${v.nextServiceDate} (${daysLeft} day(s) left).`
            );
          }
        }
      }
    }
  }

  private channels(): Array<'email' | 'whatsapp'> {
    const c = this.settings.channel;
    return c === 'both' ? ['email', 'whatsapp'] : [c];
  }

  private recipientFor(channel: 'email' | 'whatsapp'): string {
    return channel === 'email'
      ? (this.settings.recipientEmail || '').trim()
      : (this.settings.whatsappNumber || '').replace(/\D/g, '');
  }

  private async dispatch(
    dedupeKey: string,
    jobType: DeliveryLogEntry['jobType'],
    subject: string,
    body: string
  ): Promise<void> {
    for (const channel of this.channels()) {
      const fullKey = `${dedupeKey}:${channel}`;
      if (this.log.some((l) => l.dedupeKey === fullKey && l.status === 'SENT'))
        continue;
      if (this.pendingRetries.has(fullKey)) continue;
      await this.attempt(fullKey, jobType, channel, subject, body, 1);
    }
  }

  private async attempt(
    fullKey: string,
    jobType: DeliveryLogEntry['jobType'],
    channel: 'email' | 'whatsapp',
    subject: string,
    body: string,
    attemptNo: number
  ): Promise<void> {
    const nowIso = this.now().toISOString();
    const recipient = this.recipientFor(channel);

    const write = (
      status: DeliveryStatus,
      detail: string,
      error?: string
    ): void => {
      const existing = this.log.find((l) => l.dedupeKey === fullKey);
      if (existing) {
        existing.status = status;
        existing.attempts = attemptNo;
        existing.detail = detail;
        existing.error = error;
        existing.updatedAt = nowIso;
      } else {
        this.log.push({
          id: `dl-${++this.seq}`,
          dedupeKey: fullKey,
          jobType,
          channel,
          recipient,
          status,
          attempts: attemptNo,
          detail,
          error,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
    };

    if (!this.settings.consentGivenAt) {
      write('SKIPPED', 'Owner consent has not been recorded.');
      return;
    }
    if (!recipient) {
      write('SKIPPED', `No ${channel} recipient configured.`);
      return;
    }

    const result = await this.send(channel, recipient, subject, body);
    if (result.ok) {
      write('SENT', `${subject} -> ${recipient}`);
      this.pendingRetries.delete(fullKey);
      return;
    }
    if (result.notConfigured) {
      write('SKIPPED', `${channel} integration is not configured.`, result.error);
      return;
    }
    write('FAILED', `${subject} -> ${recipient}`, result.error);
    if (attemptNo < MAX_ATTEMPTS) {
      this.pendingRetries.set(fullKey, {
        nextAttemptAt:
          this.now().getTime() + RETRY_BACKOFF_MS[attemptNo - 1],
      });
      // retry metadata kept in-memory; attempt number continues from log
    }
  }

  private async flushRetries(now: Date): Promise<void> {
    for (const [fullKey, r] of [...this.pendingRetries.entries()]) {
      if (now.getTime() < r.nextAttemptAt) continue;
      this.pendingRetries.delete(fullKey);
      const entry = this.log.find((l) => l.dedupeKey === fullKey);
      if (!entry || entry.status === 'SENT') continue;
      await this.attempt(
        fullKey,
        entry.jobType,
        entry.channel,
        entry.detail.split(' -> ')[0] || entry.jobType,
        '(retry of earlier dispatch)',
        entry.attempts + 1
      );
    }
  }
}
