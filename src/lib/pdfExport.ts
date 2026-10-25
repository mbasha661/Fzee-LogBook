import jsPDF from 'jspdf';
import {
  ComplianceDocument,
  CustomLogbookHeaders,
  DailyLogbookEntry,
  Driver,
  ServiceRecord,
  Vehicle,
  VehicleProfitLossSummary,
} from '../types/fleet';
import {
  aggregateDriverSettlements,
  aggregateVehicleProfitAndLoss,
  DriverSettlementSummary,
  formatINR,
  formatKm,
  roundCurrency,
  roundKm,
} from './calculations';

interface AutoTableOptions {
  startY: number;
  head: string[][];
  body: string[][];
  theme?: string;
  styles?: {
    fontSize?: number;
    cellPadding?: number;
    textColor?: [number, number, number];
  };
  headStyles?: {
    fillColor?: [number, number, number];
    textColor?: [number, number, number];
    fontStyle?: string;
  };
  alternateRowStyles?: {
    fillColor?: [number, number, number];
  };
  didParseCell?: (data: {
    row: { index: number };
    cell: {
      styles: {
        fontStyle?: string;
        fillColor?: [number, number, number];
      };
    };
  }) => void;
}

function autoTable(doc: jsPDF, options: AutoTableOptions): void {
  const marginX = 10;
  const usableWidth = 297 - marginX * 2;
  const headRow = options.head[0] || [];
  const colCount = Math.max(1, headRow.length);
  const colWidth = usableWidth / colCount;

  const fontSize = options.styles?.fontSize ?? 7;
  const cellPadding = options.styles?.cellPadding ?? 1.6;
  const rowHeight = Math.max(5.2, fontSize * 0.55 + cellPadding * 1.8);

  let currentY = options.startY;

  const drawHeader = (y: number): number => {
    const hFill = options.headStyles?.fillColor || [15, 23, 42];
    const hText = options.headStyles?.textColor || [255, 255, 255];
    doc.setFillColor(hFill[0], hFill[1], hFill[2]);
    doc.rect(marginX, y, usableWidth, rowHeight + 1, 'F');
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(hText[0], hText[1], hText[2]);

    headRow.forEach((cellText, colIdx) => {
      const x = marginX + colIdx * colWidth + 1.2;
      const maxChars = Math.max(4, Math.floor(colWidth * 1.65));
      const clipped = String(cellText ?? '').slice(0, maxChars);
      doc.text(clipped, x, y + rowHeight * 0.72);
    });

    return y + rowHeight + 1;
  };

  currentY = drawHeader(currentY);

  options.body.forEach((row, rowIndex) => {
    if (currentY + rowHeight > 195) {
      doc.addPage('a4', 'landscape');
      currentY = 16;
      currentY = drawHeader(currentY);
    }

    const cellConfig = {
      row: { index: rowIndex },
      cell: {
        styles: {
          fontStyle: 'normal' as string | undefined,
          fillColor: (rowIndex % 2 === 1
            ? options.alternateRowStyles?.fillColor || [248, 250, 252]
            : [255, 255, 255]) as [number, number, number] | undefined,
        },
      },
    };

    if (options.didParseCell) {
      options.didParseCell(cellConfig);
    }

    const bg = cellConfig.cell.styles.fillColor || [255, 255, 255];
    doc.setFillColor(bg[0], bg[1], bg[2]);
    doc.rect(marginX, currentY, usableWidth, rowHeight, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(marginX, currentY, usableWidth, rowHeight, 'S');

    const textCol = options.styles?.textColor || [15, 23, 42];
    doc.setTextColor(textCol[0], textCol[1], textCol[2]);
    doc.setFontSize(fontSize);
    doc.setFont(
      'helvetica',
      cellConfig.cell.styles.fontStyle === 'bold' ? 'bold' : 'normal'
    );

    row.forEach((cellVal, colIdx) => {
      const x = marginX + colIdx * colWidth + 1.2;
      const maxChars = Math.max(4, Math.floor(colWidth * 1.75));
      const clipped = String(cellVal ?? '').slice(0, maxChars);
      doc.text(clipped, x, currentY + rowHeight * 0.68);
    });

    currentY += rowHeight;
  });

  (doc as any).lastAutoTable = { finalY: currentY };
}

export interface LogbookPdfReportOptions {
  title: string;
  businessName: string;
  ownerName?: string;
  dateRangeLabel: string;
  vehicleFilterLabel: string;
  entries: DailyLogbookEntry[];
  isDemoMode: boolean;
  customHeaders?: Partial<CustomLogbookHeaders>;
}

function addExecutiveHeaderAndFooter(
  doc: jsPDF,
  title: string,
  subtitle: string,
  businessName: string,
  isDemoMode: boolean
) {
  const nowStr = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // Top Navy Header Bar
  doc.setFillColor(15, 23, 42); // Slate-900 Navy
  doc.rect(0, 0, 297, 25, 'F');

  // Teal Accent Stripe
  doc.setFillColor(13, 148, 136); // Teal-600
  doc.rect(0, 25, 297, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`FzeeLog — ${businessName}`, 12, 11);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(title, 12, 18);

  doc.setFontSize(8);
  doc.text(
    `Generated: ${nowStr} (Asia/Kolkata) | Currency: INR (Rs.) | Distance: km`,
    285,
    11,
    { align: 'right' }
  );
  doc.text(
    `${subtitle}${isDemoMode ? ' | [DEMO PREVIEW DATA]' : ' | [VERIFIED LIVE RECORD]'}`,
    285,
    18,
    { align: 'right' }
  );
}

function stampPageNumbers(doc: jsPDF, footerTag: string, accountLabel = '') {
  const pageCount = (doc as any).internal.getNumberOfPages();
  const accountSegment = accountLabel
    ? ` | Account: ${String(accountLabel).slice(0, 60)}`
    : '';
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${footerTag} — Page ${i} of ${pageCount}${accountSegment}`,
      148.5,
      204,
      { align: 'center' }
    );
  }
}

/**
 * 1. Generates a Landscape A4 PDF containing all 15 user-facing Daily Logbook columns,
 * summary KPI cards, and separated Driver Share vs. Operating Expense totals.
 */
export function generateLogbookPdfReport(options: LogbookPdfReportOptions): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const {
    title,
    businessName,
    dateRangeLabel,
    vehicleFilterLabel,
    entries,
    isDemoMode,
  } = options;

  addExecutiveHeaderAndFooter(
    doc,
    title,
    `Scope: ${vehicleFilterLabel} | Period: ${dateRangeLabel}`,
    businessName,
    isDemoMode
  );

  const totalKm = roundKm(entries.reduce((acc, e) => acc + e.kmDay, 0));
  const totalEarnings = roundCurrency(
    entries.reduce((acc, e) => acc + e.earnings, 0)
  );
  const totalDriverShare = roundCurrency(
    entries.reduce((acc, e) => acc + e.driverShare, 0)
  );
  const totalGasFuel = roundCurrency(
    entries.reduce((acc, e) => acc + e.gasFuel, 0)
  );
  const totalRedTaxi = roundCurrency(
    entries.reduce((acc, e) => acc + e.redTaxi, 0)
  );
  const totalToll = roundCurrency(entries.reduce((acc, e) => acc + e.toll, 0));
  const totalMaintenance = roundCurrency(
    entries.reduce((acc, e) => acc + e.maintenance, 0)
  );
  const totalOperatingExpenses = roundCurrency(
    entries.reduce((acc, e) => acc + e.totalExpenses, 0)
  );
  const totalNetEarnings = roundCurrency(
    entries.reduce((acc, e) => acc + e.netBusinessEarnings, 0)
  );
  const avgUnitPrice =
    totalKm > 0 ? roundCurrency(totalEarnings / totalKm) : 0;

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Total Distance: ${formatKm(totalKm)}   |   Gross Earnings: ${formatINR(totalEarnings)}   |   Driver Share (Separate): ${formatINR(totalDriverShare)}   |   Operating Expenses: ${formatINR(totalOperatingExpenses)}   |   Net Business Earnings: ${formatINR(totalNetEarnings)}`,
    12,
    33
  );

  const ch = options.customHeaders || {};
  const head = [
    [
      ch.sno || '1. S.NO',
      ch.date || '2. Date',
      'Vehicle',
      ch.startingKm || '3. Start KM',
      ch.endingKm || '4. End KM',
      ch.kmDay || '5. KM/DAY',
      ch.attendance || '6. Attendance',
      ch.earnings || '7. Earnings',
      ch.unitPrice || '8. Unit Price',
      ch.driverShare || '9. Driver Share',
      ch.gasFuel || '10. Gas/Fuel',
      ch.redTaxi || '11. Red Taxi',
      ch.toll || '12. Toll',
      ch.maintenance || '13. Maint.',
      ch.totalExpenses || '14. Total Exp.',
      ch.netBusinessEarnings || 'Net Surplus',
      ch.sourceRemarks || '15. Source/Remarks',
    ],
  ];

  const body = entries.map((e, idx) => [
    String(idx + 1),
    `${e.date || e.entryDate || ''} (S${e.shiftNumber})`,
    e.vehicleRegistration,
    e.startingKm.toFixed(1),
    e.endingKm.toFixed(1),
    e.kmDay.toFixed(1),
    e.attendance,
    e.earnings.toFixed(2),
    e.unitPrice.toFixed(2),
    e.driverShare.toFixed(2),
    e.gasFuel.toFixed(2),
    e.redTaxi.toFixed(2),
    e.toll.toFixed(2),
    e.maintenance.toFixed(2),
    e.totalExpenses.toFixed(2),
    e.netBusinessEarnings.toFixed(2),
    e.sourceRemarks || '-',
  ]);

  body.push([
    'TOTAL',
    `${entries.length} Shifts`,
    '-',
    '-',
    '-',
    totalKm.toFixed(1),
    '-',
    totalEarnings.toFixed(2),
    avgUnitPrice.toFixed(2),
    totalDriverShare.toFixed(2),
    totalGasFuel.toFixed(2),
    totalRedTaxi.toFixed(2),
    totalToll.toFixed(2),
    totalMaintenance.toFixed(2),
    totalOperatingExpenses.toFixed(2),
    totalNetEarnings.toFixed(2),
    'Driver share excluded from Total Exp.',
  ]);

  autoTable(doc, {
    startY: 37,
    head,
    body,
    theme: 'grid',
    styles: {
      fontSize: 6.5,
      cellPadding: 1.5,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didParseCell: (data) => {
      if (data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [226, 232, 240];
      }
    },
  });

  stampPageNumbers(doc, 'FzeeLog 15-Column Daily Logbook Report', businessName);
  const safeDate = new Date().toISOString().slice(0, 10);
  doc.save(`FzeeLog_15Col_Logbook_${safeDate}.pdf`);
}

/**
 * 2. Generates an Executive Vehicle Profit & Loss (P&L) & Performance PDF Statement
 */
export function generateVehicleProfitLossPdf(options: {
  businessName: string;
  ownerName?: string;
  dateRangeLabel: string;
  vehicles?: Vehicle[];
  entries?: DailyLogbookEntry[];
  serviceRecords?: ServiceRecord[];
  summaries?: VehicleProfitLossSummary[];
  isDemoMode: boolean;
}): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const { businessName, dateRangeLabel, isDemoMode } = options;
  const summaries =
    options.summaries ||
    aggregateVehicleProfitAndLoss(
      options.vehicles || [],
      options.entries || [],
      options.serviceRecords || []
    );

  addExecutiveHeaderAndFooter(
    doc,
    'Executive Vehicle Profit & Loss (P&L) & Operational Efficiency Statement',
    `Period: ${dateRangeLabel} | Vehicles Evaluated: ${summaries.length}`,
    businessName,
    isDemoMode
  );

  const fleetKm = roundKm(summaries.reduce((s, v) => s + v.totalKm, 0));
  const fleetGross = roundCurrency(
    summaries.reduce((s, v) => s + v.grossEarnings, 0)
  );
  const fleetDriverShare = roundCurrency(
    summaries.reduce((s, v) => s + v.driverShareTotal, 0)
  );
  const fleetLogbookExp = roundCurrency(
    summaries.reduce((s, v) => s + v.logbookOperatingExpenses, 0)
  );
  const fleetWorkshopCost = roundCurrency(
    summaries.reduce((s, v) => s + v.workshopServiceCostTotal, 0)
  );
  const fleetNetAfterService = roundCurrency(
    summaries.reduce((s, v) => s + v.netAfterWorkshopService, 0)
  );

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Fleet Distance: ${formatKm(fleetKm)}  |  Gross Revenue: ${formatINR(fleetGross)}  |  Driver Share: ${formatINR(fleetDriverShare)}  |  Logbook OpEx: ${formatINR(fleetLogbookExp)}  |  Workshop Service: ${formatINR(fleetWorkshopCost)}  |  Net Surplus: ${formatINR(fleetNetAfterService)}`,
    12,
    33
  );

  const body = summaries.map((v, idx) => [
    String(idx + 1),
    v.registrationNumber,
    v.makeModel,
    String(v.shiftsCount),
    v.totalKm.toFixed(1),
    v.grossEarnings.toFixed(2),
    v.avgUnitPrice.toFixed(2),
    v.driverShareTotal.toFixed(2),
    v.gasFuelTotal.toFixed(2),
    v.redTaxiTotal.toFixed(2),
    v.tollTotal.toFixed(2),
    v.logbookOperatingExpenses.toFixed(2),
    v.workshopServiceCostTotal.toFixed(2),
    v.netLogbookEarnings.toFixed(2),
    v.netAfterWorkshopService.toFixed(2),
  ]);

  body.push([
    'TOTAL',
    `${summaries.length} Vehicles`,
    '-',
    String(summaries.reduce((s, v) => s + v.shiftsCount, 0)),
    fleetKm.toFixed(1),
    fleetGross.toFixed(2),
    fleetKm > 0 ? roundCurrency(fleetGross / fleetKm).toFixed(2) : '0.00',
    fleetDriverShare.toFixed(2),
    summaries.reduce((s, v) => s + v.gasFuelTotal, 0).toFixed(2),
    summaries.reduce((s, v) => s + v.redTaxiTotal, 0).toFixed(2),
    summaries.reduce((s, v) => s + v.tollTotal, 0).toFixed(2),
    fleetLogbookExp.toFixed(2),
    fleetWorkshopCost.toFixed(2),
    summaries.reduce((s, v) => s + v.netLogbookEarnings, 0).toFixed(2),
    fleetNetAfterService.toFixed(2),
  ]);

  autoTable(doc, {
    startY: 37,
    head: [
      [
        'S.NO',
        'Registration',
        'Make & Model',
        'Shifts',
        'Total KM',
        'Gross (Rs.)',
        'Unit (Rs/km)',
        'Driver Share',
        'Gas/Fuel',
        'Red Taxi',
        'Toll',
        'Logbook OpEx',
        'Workshop Cost',
        'Net Logbook',
        'Net After Service',
      ],
    ],
    body,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.8 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    didParseCell: (data) => {
      if (data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [226, 232, 240];
      }
    },
  });

  stampPageNumbers(doc, 'FzeeLog Vehicle Profit & Loss Statement', businessName);
  const safeDate = new Date().toISOString().slice(0, 10);
  doc.save(`FzeeLog_Vehicle_PnL_${safeDate}.pdf`);
}

/**
 * 3. Generates a Driver Settlement, Attendance & Share Payout Statement PDF
 */
export function generateDriverSettlementPdf(options: {
  businessName: string;
  ownerName?: string;
  dateRangeLabel: string;
  drivers: Driver[];
  entries?: DailyLogbookEntry[];
  settlements?: DriverSettlementSummary[];
  isDemoMode: boolean;
}): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const { businessName, dateRangeLabel, drivers, isDemoMode } = options;
  const settlements =
    options.settlements ||
    aggregateDriverSettlements(drivers, options.entries || []);

  addExecutiveHeaderAndFooter(
    doc,
    'Driver Attendance, Share Payout & Settlement Statement',
    `Settlement Period: ${dateRangeLabel} | Drivers: ${settlements.length}`,
    businessName,
    isDemoMode
  );

  const totalGross = roundCurrency(
    settlements.reduce((s, d) => s + d.grossEarningsGenerated, 0)
  );
  const totalShare = roundCurrency(
    settlements.reduce((s, d) => s + d.totalDriverShareEarned, 0)
  );
  const totalOwnerNet = roundCurrency(
    settlements.reduce((s, d) => s + d.netOwnerContribution, 0)
  );

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Gross Shift Revenue: ${formatINR(totalGross)}   |   Total Driver Share Payable: ${formatINR(totalShare)}   |   Net Owner Contribution: ${formatINR(totalOwnerNet)}`,
    12,
    33
  );

  const body = settlements.map((s, idx) => {
    const drvMeta = drivers.find((d) => d.id === s.driverId);
    return [
      String(idx + 1),
      s.driverName,
      drvMeta?.phone || '-',
      drvMeta?.licenseNumber || '-',
      `${drvMeta?.defaultSharePct ?? 30}%`,
      String(s.shiftsWorked),
      String(s.presentDays),
      String(s.halfDays),
      String(s.leaveOrAbsentDays),
      s.totalKmDriven.toFixed(1),
      s.grossEarningsGenerated.toFixed(2),
      s.totalDriverShareEarned.toFixed(2),
      s.totalFuelAndTollHandled.toFixed(2),
      s.netOwnerContribution.toFixed(2),
      '________________',
    ];
  });

  body.push([
    'TOTAL',
    `${settlements.length} Drivers`,
    '-',
    '-',
    '-',
    String(settlements.reduce((a, b) => a + b.shiftsWorked, 0)),
    String(settlements.reduce((a, b) => a + b.presentDays, 0)),
    String(settlements.reduce((a, b) => a + b.halfDays, 0)),
    String(settlements.reduce((a, b) => a + b.leaveOrAbsentDays, 0)),
    settlements.reduce((a, b) => a + b.totalKmDriven, 0).toFixed(1),
    totalGross.toFixed(2),
    totalShare.toFixed(2),
    settlements.reduce((a, b) => a + b.totalFuelAndTollHandled, 0).toFixed(2),
    totalOwnerNet.toFixed(2),
    'Verified Sign-Off',
  ]);

  autoTable(doc, {
    startY: 37,
    head: [
      [
        'S.NO',
        'Driver Name',
        'Phone',
        'DL Number',
        'Share %',
        'Shifts',
        'Present',
        'Half Day',
        'Leave/Abs',
        'Total KM',
        'Gross (Rs.)',
        'Driver Share (Rs.)',
        'Fuel+Toll Handled',
        'Net Owner Surplus',
        'Driver Signature',
      ],
    ],
    body,
    theme: 'grid',
    styles: { fontSize: 7.2, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    didParseCell: (data) => {
      if (data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [226, 232, 240];
      }
    },
  });

  stampPageNumbers(doc, 'FzeeLog Driver Settlement & Attendance Statement', businessName);
  const safeDate = new Date().toISOString().slice(0, 10);
  doc.save(`FzeeLog_Driver_Settlements_${safeDate}.pdf`);
}

/**
 * 4. Generates a Fleet Compliance & Odometer Summary PDF Report
 */
export function generateVehiclesCompliancePdf(options: {
  businessName: string;
  vehicles: Vehicle[];
  complianceDocuments?: ComplianceDocument[];
  isDemoMode: boolean;
}): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  addExecutiveHeaderAndFooter(
    doc,
    'Fleet Inventory, Validated Odometers & Statutory Expiry Audit',
    `Total Vehicles: ${options.vehicles.length} | Uploaded Certificates: ${options.complianceDocuments?.length ?? 0}`,
    options.businessName,
    options.isDemoMode
  );

  autoTable(doc, {
    startY: 32,
    head: [
      [
        'S.NO',
        'Registration',
        'Make / Model / Year',
        'Fuel & Type',
        'Ownership',
        'Current Odometer',
        'Assigned Driver',
        'FC Expiry',
        'Insurance Expiry',
        'Permit Expiry',
        'PUC Expiry',
        'Next Service KM',
        'Status',
      ],
    ],
    body: options.vehicles.map((v, idx) => [
      String(idx + 1),
      v.registrationNumber,
      `${v.make} ${v.model} (${v.manufacturingYear})`,
      `${v.fuelType} / ${v.vehicleType}`,
      v.ownershipType,
      formatKm(v.currentOdometerKm),
      v.assignedDriverName || 'Unassigned',
      v.fcExpiry || '-',
      v.insuranceExpiry || '-',
      v.permitExpiry || '-',
      v.pollutionExpiry || '-',
      formatKm(v.nextServiceOdometerKm),
      v.status,
    ]),
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
  });

  if (options.complianceDocuments && options.complianceDocuments.length > 0) {
    const finalY = (doc as any).lastAutoTable?.finalY || 110;
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(
      'Uploaded Statutory Certificate Vault & Renewal Ledger',
      12,
      finalY + 9
    );

    autoTable(doc, {
      startY: finalY + 13,
      head: [
        [
          'S.NO',
          'Target',
          'Document Type',
          'Certificate / Policy No.',
          'Issuing Authority / Insurer',
          'Issue Date',
          'Expiry Date',
          'Fee / Premium (INR)',
          'Status',
        ],
      ],
      body: options.complianceDocuments.map((d, i) => [
        String(i + 1),
        d.targetLabel,
        d.documentType,
        d.documentNumber,
        d.providerOrAuthority || '-',
        d.issueDate || '-',
        d.expiryDate,
        d.premiumOrFee.toFixed(2),
        d.status,
      ]),
      theme: 'grid',
      styles: { fontSize: 7.2, cellPadding: 1.8 },
      headStyles: { fillColor: [13, 148, 136], textColor: [255, 255, 255] },
    });
  }

  stampPageNumbers(doc, 'FzeeLog Statutory Compliance & Odometer Audit', options.businessName);
  const safeDate = new Date().toISOString().slice(0, 10);
  doc.save(`FzeeLog_Fleet_Compliance_${safeDate}.pdf`);
}

/**
 * 5. Generates a Preventive Maintenance & Workshop Service History PDF Report
 */
export function generateServiceMaintenancePdf(options: {
  businessName: string;
  serviceRecords: ServiceRecord[];
  isDemoMode: boolean;
}): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const totalParts = roundCurrency(
    options.serviceRecords.reduce((s, r) => s + r.partsCost, 0)
  );
  const totalLabor = roundCurrency(
    options.serviceRecords.reduce((s, r) => s + r.laborCost, 0)
  );
  const grandTotal = roundCurrency(
    options.serviceRecords.reduce((s, r) => s + r.totalCost, 0)
  );

  addExecutiveHeaderAndFooter(
    doc,
    'Preventive Maintenance & Workshop Service Cost Ledger',
    `Total Service Events: ${options.serviceRecords.length}`,
    options.businessName,
    options.isDemoMode
  );

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Spare Parts Total: ${formatINR(totalParts)}   |   Workshop Labor Total: ${formatINR(totalLabor)}   |   Total Maintenance Expenditure: ${formatINR(grandTotal)}`,
    12,
    33
  );

  autoTable(doc, {
    startY: 37,
    head: [
      [
        'S.NO',
        'Service Date',
        'Vehicle',
        'Service Category',
        'Odometer (km)',
        'Next Due (km)',
        'Next Due Date',
        'Workshop / Vendor',
        'Invoice #',
        'Parts (Rs.)',
        'Labor (Rs.)',
        'Total (Rs.)',
        'Status',
        'Notes',
      ],
    ],
    body: options.serviceRecords.map((r, idx) => [
      String(idx + 1),
      r.serviceDate,
      r.vehicleRegistration,
      r.serviceType,
      r.odometerKm.toFixed(1),
      r.nextServiceDueKm.toFixed(1),
      r.nextServiceDueDate || '-',
      r.workshopName,
      r.invoiceNumber || '-',
      r.partsCost.toFixed(2),
      r.laborCost.toFixed(2),
      r.totalCost.toFixed(2),
      r.status,
      r.notes || '-',
    ]),
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.8 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
  });

  stampPageNumbers(doc, 'FzeeLog Preventive Maintenance & Workshop Ledger', options.businessName);
  const safeDate = new Date().toISOString().slice(0, 10);
  doc.save(`FzeeLog_Maintenance_Service_${safeDate}.pdf`);
}

/**
 * 6. Generates an All-in-One Executive Fleet Dossier PDF combining Vehicle P&L,
 * Driver Settlements, 15-Column Logbook Register, and Statutory Compliance.
 */
export function generateExecutiveFleetDossierPdf(options: {
  businessName: string;
  ownerName?: string;
  intendedDriveEmail?: string;
  dateRangeLabel: string;
  vehicles: Vehicle[];
  drivers: Driver[];
  entries: DailyLogbookEntry[];
  serviceRecords: ServiceRecord[];
  complianceDocuments: ComplianceDocument[];
  alerts?: any[];
  vehiclePnL?: VehicleProfitLossSummary[];
  driverSettlements?: DriverSettlementSummary[];
  isDemoMode: boolean;
}): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const vehiclePnL =
    options.vehiclePnL ||
    aggregateVehicleProfitAndLoss(
      options.vehicles,
      options.entries,
      options.serviceRecords
    );
  const driverSettlements =
    options.driverSettlements ||
    aggregateDriverSettlements(options.drivers, options.entries);

  addExecutiveHeaderAndFooter(
    doc,
    'Complete Executive Fleet Dossier (P&L, Settlements, 15-Col Logbook & Compliance)',
    `Period: ${options.dateRangeLabel} | Vehicles: ${options.vehicles.length} | Shifts: ${options.entries.length}`,
    options.businessName,
    options.isDemoMode
  );

  // Section 1: Vehicle Profit & Loss Summary
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Section 1 — Vehicle Profit & Loss (P&L) Summary', 12, 33);

  autoTable(doc, {
    startY: 36,
    head: [
      [
        'Registration',
        'Make & Model',
        'Shifts',
        'Distance (km)',
        'Gross Revenue',
        'Driver Share (Separate)',
        'Logbook OpEx',
        'Workshop Cost',
        'Net After Service',
      ],
    ],
    body: vehiclePnL.map((v) => [
      v.registrationNumber,
      v.makeModel,
      String(v.shiftsCount),
      v.totalKm.toFixed(1),
      v.grossEarnings.toFixed(2),
      v.driverShareTotal.toFixed(2),
      v.logbookOperatingExpenses.toFixed(2),
      v.workshopServiceCostTotal.toFixed(2),
      v.netAfterWorkshopService.toFixed(2),
    ]),
    theme: 'grid',
    styles: { fontSize: 7.2, cellPadding: 1.8 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
  });

  // Section 2: Driver Settlements
  const yAfterPnL = ((doc as any).lastAutoTable?.finalY || 80) + 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Section 2 — Driver Attendance & Share Payout Summary', 12, yAfterPnL);

  autoTable(doc, {
    startY: yAfterPnL + 3,
    head: [
      [
        'Driver Name',
        'Shifts',
        'Present Days',
        'Half Days',
        'Total KM',
        'Gross Generated (Rs.)',
        'Driver Share Earned (Rs.)',
        'Net Owner Contribution (Rs.)',
      ],
    ],
    body: driverSettlements.map((d) => [
      d.driverName,
      String(d.shiftsWorked),
      String(d.presentDays),
      String(d.halfDays),
      d.totalKmDriven.toFixed(1),
      d.grossEarningsGenerated.toFixed(2),
      d.totalDriverShareEarned.toFixed(2),
      d.netOwnerContribution.toFixed(2),
    ]),
    theme: 'grid',
    styles: { fontSize: 7.2, cellPadding: 1.8 },
    headStyles: { fillColor: [13, 148, 136], textColor: [255, 255, 255] },
  });

  // New Page for 15-Column Daily Logbook Register
  doc.addPage('a4', 'landscape');
  addExecutiveHeaderAndFooter(
    doc,
    'Section 3 — 15-Column Daily Logbook Shift Register',
    `Period: ${options.dateRangeLabel} | Entries: ${options.entries.length}`,
    options.businessName,
    options.isDemoMode
  );

  autoTable(doc, {
    startY: 32,
    head: [
      [
        '1. S.NO',
        '2. Date',
        'Vehicle',
        '3. Start KM',
        '4. End KM',
        '5. KM/DAY',
        '6. Attendance',
        '7. Earnings',
        '8. Unit Price',
        '9. Driver Share',
        '10. Gas/Fuel',
        '11. Red Taxi',
        '12. Toll',
        '13. Maint.',
        '14. Total Exp.',
        '15. Source/Remarks',
      ],
    ],
    body: options.entries.map((e, idx) => [
      String(idx + 1),
      `${e.date || e.entryDate || ''} (S${e.shiftNumber})`,
      e.vehicleRegistration,
      e.startingKm.toFixed(1),
      e.endingKm.toFixed(1),
      e.kmDay.toFixed(1),
      e.attendance,
      e.earnings.toFixed(2),
      e.unitPrice.toFixed(2),
      e.driverShare.toFixed(2),
      e.gasFuel.toFixed(2),
      e.redTaxi.toFixed(2),
      e.toll.toFixed(2),
      e.maintenance.toFixed(2),
      e.totalExpenses.toFixed(2),
      e.sourceRemarks || '-',
    ]),
    theme: 'grid',
    styles: { fontSize: 6.5, cellPadding: 1.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
  });

  stampPageNumbers(doc, 'FzeeLog Complete Executive Fleet Dossier', options.businessName);
  const safeDate = new Date().toISOString().slice(0, 10);
  doc.save(`FzeeLog_Executive_Dossier_${safeDate}.pdf`);
}

/**
 * Exports the 15-column daily logbook or Vehicle P&L summary as a downloadable CSV spreadsheet.
 */
export function export15ColLogbookCsv(
  entries: DailyLogbookEntry[],
  filePrefix = 'FzeeLog_15Col_Logbook',
  customHeaders?: Partial<CustomLogbookHeaders>
): void {
  const ch = customHeaders || {};
  const headers = [
    ch.sno || 'S.NO',
    ch.date || 'Date',
    'Vehicle Registration',
    'Driver Name',
    'Shift',
    ch.startingKm || 'Starting KM',
    ch.endingKm || 'Ending KM',
    ch.kmDay || 'KM/DAY',
    ch.attendance || 'Attendance',
    ch.earnings || 'Earnings (INR)',
    ch.unitPrice || 'Unit Price (INR/km)',
    'Driver Share %',
    ch.driverShare || 'Driver Share (INR)',
    ch.gasFuel || 'Gas/Fuel (INR)',
    ch.redTaxi || 'Red Taxi (INR)',
    ch.toll || 'Toll (INR)',
    ch.maintenance || 'Maintenance (INR)',
    ch.totalExpenses || 'Total Expenses (INR)',
    ch.netBusinessEarnings || 'Net Business Earnings (INR)',
    ch.sourceRemarks || 'Source/Remarks',
  ];

  const escapeCsv = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = entries.map((e, idx) =>
    [
      idx + 1,
      e.date || e.entryDate || '',
      e.vehicleRegistration,
      e.driverName || '',
      e.shiftNumber,
      e.startingKm.toFixed(1),
      e.endingKm.toFixed(1),
      e.kmDay.toFixed(1),
      e.attendance,
      e.earnings.toFixed(2),
      e.unitPrice.toFixed(2),
      e.driverSharePct,
      e.driverShare.toFixed(2),
      e.gasFuel.toFixed(2),
      e.redTaxi.toFixed(2),
      e.toll.toFixed(2),
      e.maintenance.toFixed(2),
      e.totalExpenses.toFixed(2),
      e.netBusinessEarnings.toFixed(2),
      e.sourceRemarks || '',
    ]
      .map(escapeCsv)
      .join(',')
  );

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filePrefix}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export const exportLogbookCsv15Column = export15ColLogbookCsv;

