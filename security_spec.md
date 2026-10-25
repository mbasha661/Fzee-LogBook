# FzeeLog — Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants

1. **Tenant Isolation (`ownerId == request.auth.uid`)**: Every document in `/profiles/{userId}`, `/vehicles/{vehicleId}`, `/drivers/{driverId}`, `/daily_logbook_entries/{entryId}`, `/service_records/{serviceId}`, `/compliance_documents/{docId}`, `/vehicle_media/{mediaId}`, and `/audit_logs/{logId}` MUST carry an `ownerId` matching `request.auth.uid`.
2. **Ownership Immutability**: On `update`, `request.resource.data.ownerId == resource.data.ownerId` and `request.resource.data.createdAt == resource.data.createdAt`.
3. **Odometer Monotonicity & Shift Math**:
   - `startingKm >= 0`
   - `endingKm >= startingKm`
   - `kmDay == endingKm - startingKm`
   - `kmDay <= 10000`
4. **Financial Non-Negativity & Separation of Concerns**:
   - `earnings >= 0`, `unitPrice >= 0`, `driverSharePct >= 0 && driverSharePct <= 100`, `driverShare >= 0`
   - `gasFuel >= 0`, `redTaxi >= 0`, `toll >= 0`, `maintenance >= 0`, `otherExpenses >= 0`, `totalExpenses >= 0`
   - Driver share is tracked separately from operating expenses (`totalExpenses`).
5. **Preventive Maintenance & Workshop Service Invariants**:
   - `odometerKm >= 0` and `nextServiceDueKm >= odometerKm`
   - `partsCost >= 0`, `laborCost >= 0`, `totalCost >= 0`
   - `serviceType` restricted to valid workshop categories.
6. **Statutory Compliance Document Vault Invariants**:
   - `targetType in ['Vehicle', 'Driver']`
   - `documentType` restricted to statutory Indian transport certificates (`Insurance Policy`, `Fitness Certificate (FC)`, `Permit Certificate`, `Pollution Certificate (PUCC)`, `Registration Certificate (RC)`, `Tax Receipt`, `Driver Licence`).
   - `premiumOrFee >= 0`, `fileSizeBytes >= 0 && fileSizeBytes <= 20000000`, `fileDataUrl.size() <= 150000`.
7. **3D Vehicle Media & Multi-Angle Asset Invariants (`VehicleMedia`)**:
   - `mediaCategory in ['AnglePhoto', 'Model3D', 'AICalibration']`
   - `angleLabel in ['0_Front', '45_FrontLeft', '90_Left', '135_RearLeft', '180_Rear', '225_RearRight', '270_Right', '315_FrontRight', 'Custom']`
   - `angleDegrees >= 0 && angleDegrees <= 360`
   - `mimeType in ['image/jpeg', 'image/png', 'image/webp', 'model/gltf-binary', 'model/gltf+json', 'application/json']`
   - `fileSizeBytes >= 0 && fileSizeBytes <= 52428800`, `dataUrl.size() <= 250000`, `storagePath.size() <= 300`.
8. **Strict Key Whitelisting (`keys().hasOnly(...)`)**: No arbitrary unvalidated properties may be injected into any collection.
9. **Audit Trail Immutability**: `/audit_logs/{logId}` documents can be created and read by their owner, but NEVER updated or deleted (`allow update, delete: if false;`).
