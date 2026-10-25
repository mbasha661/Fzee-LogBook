import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  setDriveAccessToken,
} from '../lib/firebase';
import {
  findMemberForLogin,
  hashPin,
  resolveMemberPinHash,
  verifyMemberPin,
} from '../lib/security';
import {
  AccountMode,
  AuditLogItem,
  ComplianceDocument,
  CustomLogbookHeaders,
  DailyLogbookEntry,
  Driver,
  NotificationLog,
  NotificationStatus,
  OrganizationMember,
  OrgMemberRole,
  ServiceRecord,
  UserProfile,
  Vehicle,
  VehicleMedia,
  VehicleStatus,
} from '../types/fleet';
import {
  DEMO_COMPLIANCE_DOCUMENTS,
  DEMO_DRIVERS,
  DEMO_LOGBOOK_ENTRIES,
  DEMO_NOTIFICATION_LOGS,
  DEMO_ORGANIZATION_MEMBERS,
  DEMO_PROFILE,
  DEMO_SERVICE_RECORDS,
  DEMO_VEHICLES,
  DEMO_VEHICLE_MEDIA,
} from '../lib/demoData';
import { calculateLogbookFinancials, resolveCalculationOptions, roundCurrency, roundKm } from '../lib/calculations';

interface FleetContextValue {
  user: User | null;
  authReady: boolean;
  isDemoMode: boolean;
  setDemoMode: (enabled: boolean) => void;
  setIsDemoMode: (enabled: boolean) => void;
  profile: UserProfile | null;
  vehicles: Vehicle[];
  drivers: Driver[];
  logbookEntries: DailyLogbookEntry[];
  serviceRecords: ServiceRecord[];
  complianceDocuments: ComplianceDocument[];
  vehicleMedia: VehicleMedia[];
  notificationLogs: NotificationLog[];
  auditLogs: AuditLogItem[];
  loadingData: boolean;
  dataLoading: boolean;
  errorMessage: string | null;
  errorBanner: string | null;
  clearError: () => void;
  clearErrorBanner: () => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  organizationMembers: OrganizationMember[];
  activeOrgMember: OrganizationMember | null;
  setActiveOrgMember: (member: OrganizationMember | null) => void;
  saveOrganizationMember: (
    memberData: Omit<
      OrganizationMember,
      'id' | 'ownerId' | 'createdAt' | 'updatedAt'
    >,
    existingId?: string
  ) => Promise<void>;
  deleteOrganizationMember: (member: OrganizationMember) => Promise<void>;
  completePortalSignUpOrLogin: (params: {
    authAction: 'login' | 'signup' | 'org_member_login';
    accountMode: AccountMode;
    fullName: string;
    organizationName: string;
    email: string;
    whatsappNumber: string;
    passwordOrPin: string;
    role?: OrgMemberRole;
    memberId?: string;
  }) => Promise<void>;
  updateOwnerProfile: (
    updates: Partial<
      Pick<
        UserProfile,
        | 'displayName'
        | 'fullName'
        | 'businessName'
        | 'accountMode'
        | 'organizationName'
        | 'alertEmail'
        | 'whatsappNumber'
        | 'alertMilestonesDays'
        | 'customLogbookHeaders'
        | 'defaultDriverSharePct'
        | 'unitPriceMode'
        | 'driverShareMode'
        | 'defaultDriverShareFixed'
        | 'platformEarningsBasis'
        | 'includeDriverShareInExpenses'
        | 'intendedGoogleDriveEmail'
        | 'intendedDriveEmail'
        | 'expiryAlertDays'
        | 'expiryWarningDays'
        | 'serviceWarningKm'
      >
    >
  ) => Promise<void>;
  updateProfileConfig: (
    updates: Partial<
      Pick<
        UserProfile,
        | 'displayName'
        | 'fullName'
        | 'businessName'
        | 'accountMode'
        | 'organizationName'
        | 'alertEmail'
        | 'whatsappNumber'
        | 'alertMilestonesDays'
        | 'customLogbookHeaders'
        | 'defaultDriverSharePct'
        | 'unitPriceMode'
        | 'driverShareMode'
        | 'defaultDriverShareFixed'
        | 'platformEarningsBasis'
        | 'includeDriverShareInExpenses'
        | 'intendedGoogleDriveEmail'
        | 'intendedDriveEmail'
        | 'expiryAlertDays'
        | 'expiryWarningDays'
        | 'serviceWarningKm'
      >
    >
  ) => Promise<void>;
  saveVehicle: (
    vehicleData: Omit<Vehicle, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<void>;
  setVehicleArchiveStatus: (
    vehicle: Vehicle,
    status: VehicleStatus
  ) => Promise<void>;
  updateVehicleOdometer: (
    vehicle: Vehicle,
    newOdometerKm: number,
    remarks?: string
  ) => Promise<void>;
  saveDriver: (
    driverData: Omit<Driver, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<void>;
  setDriverArchiveStatus: (
    driver: Driver,
    status: Driver['status']
  ) => Promise<void>;
  saveLogbookEntry: (
    entryData: Record<string, any>,
    existingId?: string
  ) => Promise<void>;
  importLogbookEntries: (
    entries: Array<Record<string, any>>
  ) => Promise<number>;
  deleteLogbookEntry: (entry: DailyLogbookEntry) => Promise<void>;
  saveServiceRecord: (
    recordData: Record<string, any>,
    existingId?: string
  ) => Promise<void>;
  deleteServiceRecord: (record: ServiceRecord) => Promise<void>;
  saveComplianceDocument: (
    docData: Record<string, any>,
    existingId?: string
  ) => Promise<void>;
  deleteComplianceDocument: (docRecord: ComplianceDocument) => Promise<void>;
  saveVehicleMedia: (
    mediaData: Omit<
      VehicleMedia,
      'id' | 'ownerId' | 'createdAt' | 'updatedAt'
    >,
    existingId?: string
  ) => Promise<void>;
  deleteVehicleMedia: (mediaItem: VehicleMedia) => Promise<void>;
  saveNotificationLog: (
    notifData: Omit<
      NotificationLog,
      'id' | 'ownerId' | 'createdAt' | 'updatedAt'
    >,
    existingId?: string
  ) => Promise<void>;
  updateNotificationStatus: (
    notification: NotificationLog,
    status: NotificationStatus
  ) => Promise<void>;
  deleteNotificationLog: (notification: NotificationLog) => Promise<void>;
  restoreFleetSnapshot: (snapshot: {
    vehicles?: Vehicle[];
    drivers?: Driver[];
    dailyLogbookEntries?: DailyLogbookEntry[];
    serviceRecords?: ServiceRecord[];
    complianceDocuments?: ComplianceDocument[];
  }) => Promise<{
    vehiclesRestored: number;
    driversRestored: number;
    entriesRestored: number;
    servicesRestored: number;
    docsRestored: number;
  }>;
}

const FleetContext = createContext<FleetContextValue | undefined>(undefined);

export const FleetProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  // Live Firestore states
  const [liveProfile, setLiveProfile] = useState<UserProfile | null>(null);
  const [liveVehicles, setLiveVehicles] = useState<Vehicle[]>([]);
  const [liveDrivers, setLiveDrivers] = useState<Driver[]>([]);
  const [liveLogbookEntries, setLiveLogbookEntries] = useState<
    DailyLogbookEntry[]
  >([]);
  const [liveServiceRecords, setLiveServiceRecords] = useState<ServiceRecord[]>(
    []
  );
  const [liveComplianceDocuments, setLiveComplianceDocuments] = useState<
    ComplianceDocument[]
  >([]);
  const [liveVehicleMedia, setLiveVehicleMedia] = useState<VehicleMedia[]>([]);
  const [liveNotificationLogs, setLiveNotificationLogs] = useState<
    NotificationLog[]
  >([]);
  const [liveAuditLogs, setLiveAuditLogs] = useState<AuditLogItem[]>([]);
  const [liveOrgMembers, setLiveOrgMembers] = useState<OrganizationMember[]>(
    []
  );

  // Clearly separated Demo Mode states (never mixed with live database records)
  const [demoProfile, setDemoProfile] = useState<UserProfile>({
    ...DEMO_PROFILE,
    fullName: DEMO_PROFILE.displayName,
    intendedDriveEmail: DEMO_PROFILE.intendedGoogleDriveEmail,
    expiryWarningDays: DEMO_PROFILE.expiryAlertDays ?? 30,
  });
  const [demoOrgMembers, setDemoOrgMembers] = useState<OrganizationMember[]>(
    DEMO_ORGANIZATION_MEMBERS
  );
  const [activeOrgMember, setActiveOrgMember] =
    useState<OrganizationMember | null>(DEMO_ORGANIZATION_MEMBERS[0]);
  const [demoVehicles, setDemoVehicles] = useState<Vehicle[]>(DEMO_VEHICLES);
  const [demoDrivers, setDemoDrivers] = useState<Driver[]>(DEMO_DRIVERS);
  const [demoLogbookEntries, setDemoLogbookEntries] = useState<
    DailyLogbookEntry[]
  >(
    DEMO_LOGBOOK_ENTRIES.map((e) => ({
      ...e,
      entryDate: e.date,
    }))
  );
  const normalizeServiceRecord = (r: any): ServiceRecord => ({
    ...r,
    vehicleRegistration: r.vehicleRegistration || r.vehicleRegNo || '',
    vehicleRegNo: r.vehicleRegNo || r.vehicleRegistration || '',
    nextServiceDueKm: Number(r.nextServiceDueKm ?? r.nextServiceOdometerKm ?? 0),
    nextServiceOdometerKm: Number(
      r.nextServiceOdometerKm ?? r.nextServiceDueKm ?? 0
    ),
    nextServiceDueDate: r.nextServiceDueDate ?? r.nextServiceDate ?? '',
    nextServiceDate: r.nextServiceDate ?? r.nextServiceDueDate ?? '',
    invoiceNumber: r.invoiceNumber ?? r.invoiceReference ?? '',
    invoiceReference: r.invoiceReference ?? r.invoiceNumber ?? '',
  });

  const normalizeComplianceDocument = (d: any): ComplianceDocument => ({
    ...d,
    targetType:
      d.targetType || (d.entityType === 'driver' ? 'Driver' : 'Vehicle'),
    entityType:
      d.entityType || (d.targetType === 'Driver' ? 'driver' : 'vehicle'),
    targetId: d.targetId || d.entityId || '',
    entityId: d.entityId || d.targetId || '',
    targetLabel: d.targetLabel || d.entityLabel || '',
    entityLabel: d.entityLabel || d.targetLabel || '',
    documentType: d.documentType || d.documentCategory || 'Insurance Policy',
    documentCategory:
      d.documentCategory || d.documentType || 'Insurance Policy',
    providerOrAuthority: d.providerOrAuthority || d.issuingAuthority || '',
    issuingAuthority: d.issuingAuthority || d.providerOrAuthority || '',
    premiumOrFee: Number(d.premiumOrFee ?? d.renewalCost ?? 0),
    renewalCost: Number(d.renewalCost ?? d.premiumOrFee ?? 0),
    fileDataUrl: d.fileDataUrl ?? d.verificationDigest ?? '',
    verificationDigest: d.verificationDigest ?? d.fileDataUrl ?? '',
  });

  const [demoServiceRecords, setDemoServiceRecords] = useState<ServiceRecord[]>(
    () => DEMO_SERVICE_RECORDS.map(normalizeServiceRecord)
  );
  const [demoComplianceDocuments, setDemoComplianceDocuments] = useState<
    ComplianceDocument[]
  >(() => DEMO_COMPLIANCE_DOCUMENTS.map(normalizeComplianceDocument));
  const [demoVehicleMedia, setDemoVehicleMedia] =
    useState<VehicleMedia[]>(DEMO_VEHICLE_MEDIA);
  const [demoNotificationLogs, setDemoNotificationLogs] = useState<
    NotificationLog[]
  >(DEMO_NOTIFICATION_LOGS);
  const [demoAuditLogs, setDemoAuditLogs] = useState<AuditLogItem[]>([
    {
      id: 'audit-demo-1',
      ownerId: 'demo-owner',
      action: 'DEMO_INITIALIZED',
      entityType: 'Profile',
      entityId: 'demo-owner',
      summary:
        'Previewing isolated demo fleet dataset (INR / km / Asia/Kolkata).',
      createdAt: '2025-02-21T09:00:00.000Z',
    },
  ]);

  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);

      if (currentUser) {
        setIsDemoMode(false);
        try {
          const profileRef = doc(db, 'profiles', currentUser.uid);
          const snap = await getDoc(profileRef);
          if (!snap.exists()) {
            const now = new Date().toISOString();
            const newProfile = {
              ownerId: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || 'Fleet Operator',
              businessName: 'FzeeLog Fleet Operations',
              defaultDriverSharePct: 30,
              currency: 'INR' as const,
              distanceUnit: 'km' as const,
              timezone: 'Asia/Kolkata' as const,
              intendedGoogleDriveEmail: currentUser.email || '',
              expiryAlertDays: 30,
              serviceWarningKm: 1000,
              createdAt: now,
              updatedAt: now,
            };
            await setDoc(profileRef, newProfile);
          }
        } catch (err) {
          try {
            handleFirestoreError(
              err,
              OperationType.GET,
              `profiles/${currentUser.uid}`
            );
          } catch (formatted: any) {
            setErrorMessage(formatted.message);
          }
        }
      } else {
        setLiveProfile(null);
        setLiveVehicles([]);
        setLiveDrivers([]);
        setLiveLogbookEntries([]);
        setLiveServiceRecords([]);
        setLiveComplianceDocuments([]);
        setLiveVehicleMedia([]);
        setLiveNotificationLogs([]);
        setLiveAuditLogs([]);
      }
    });
    return () => unsub();
  }, []);

  const toIsoStringSafe = (val: any, fallback = ''): string => {
    if (!val) return fallback;
    if (typeof val === 'string') return val;
    if (typeof val.toDate === 'function') {
      try {
        return val.toDate().toISOString();
      } catch {
        return fallback;
      }
    }
    if (typeof val.seconds === 'number') {
      return new Date(val.seconds * 1000).toISOString();
    }
    return String(val);
  };

  const safeLocaleCompare = (a: any, b: any): number => {
    return toIsoStringSafe(a).localeCompare(toIsoStringSafe(b));
  };

  // Real-time Firestore listeners guarded by authReady && user && !isDemoMode
  useEffect(() => {
    if (!authReady || !user || isDemoMode) {
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    const uid = user.uid;

    const unsubProfile = onSnapshot(
      doc(db, 'profiles', uid),
      (snap) => {
        if (snap.exists()) {
          const raw = snap.data() as Record<string, any>;
          const disp = toIsoStringSafe(raw.displayName, 'Fleet Operator');
          const driveEmail = toIsoStringSafe(
            raw.intendedGoogleDriveEmail,
            ''
          );
          const expDays = Number(raw.expiryAlertDays ?? 30);
          setLiveProfile({
            id: snap.id,
            ...(raw as Omit<UserProfile, 'id'>),
            displayName: disp,
            fullName: disp,
            intendedGoogleDriveEmail: driveEmail,
            intendedDriveEmail: driveEmail,
            expiryAlertDays: expDays,
            expiryWarningDays: expDays,
            createdAt: toIsoStringSafe(raw.createdAt, new Date().toISOString()),
            updatedAt: toIsoStringSafe(raw.updatedAt, new Date().toISOString()),
          });
        }
        setLoadingData(false);
      },
      (err) => {
        setLoadingData(false);
        try {
          handleFirestoreError(err, OperationType.GET, `profiles/${uid}`);
        } catch (e: any) {
          setErrorMessage(e.message);
        }
      }
    );

    const vehiclesQuery = query(
      collection(db, 'vehicles'),
      where('ownerId', '==', uid)
    );
    const unsubVehicles = onSnapshot(
      vehiclesQuery,
      (snap) => {
        const list: Vehicle[] = snap.docs.map((d) => {
          const raw = d.data() as Record<string, any>;
          return {
            id: d.id,
            ...(raw as Omit<Vehicle, 'id'>),
            registrationNumber: toIsoStringSafe(raw.registrationNumber),
            createdAt: toIsoStringSafe(raw.createdAt, new Date().toISOString()),
            updatedAt: toIsoStringSafe(raw.updatedAt, new Date().toISOString()),
          };
        });
        list.sort((a, b) =>
          safeLocaleCompare(a.registrationNumber, b.registrationNumber)
        );
        setLiveVehicles(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'vehicles');
        } catch (e: any) {
          setErrorMessage(e.message);
        }
      }
    );

    const driversQuery = query(
      collection(db, 'drivers'),
      where('ownerId', '==', uid)
    );
    const unsubDrivers = onSnapshot(
      driversQuery,
      (snap) => {
        const list: Driver[] = snap.docs.map((d) => {
          const raw = d.data() as Record<string, any>;
          return {
            id: d.id,
            ...(raw as Omit<Driver, 'id'>),
            fullName: toIsoStringSafe(raw.fullName),
            createdAt: toIsoStringSafe(raw.createdAt, new Date().toISOString()),
            updatedAt: toIsoStringSafe(raw.updatedAt, new Date().toISOString()),
          };
        });
        list.sort((a, b) => safeLocaleCompare(a.fullName, b.fullName));
        setLiveDrivers(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'drivers');
        } catch (e: any) {
          setErrorMessage(e.message);
        }
      }
    );

    const logbookQuery = query(
      collection(db, 'daily_logbook_entries'),
      where('ownerId', '==', uid)
    );
    const unsubLogbook = onSnapshot(
      logbookQuery,
      (snap) => {
        const list: DailyLogbookEntry[] = snap.docs.map((d) => {
          const raw = d.data() as Record<string, any>;
          const dateVal = toIsoStringSafe(raw.date);
          return {
            id: d.id,
            ...(raw as Omit<DailyLogbookEntry, 'id'>),
            date: dateVal,
            entryDate: dateVal,
            createdAt: toIsoStringSafe(raw.createdAt, new Date().toISOString()),
            updatedAt: toIsoStringSafe(raw.updatedAt, new Date().toISOString()),
          };
        });
        list.sort((a, b) => {
          if (a.date !== b.date) return safeLocaleCompare(b.date, a.date);
          return (Number(b.shiftNumber) || 0) - (Number(a.shiftNumber) || 0);
        });
        setLiveLogbookEntries(list);
      },
      (err) => {
        try {
          handleFirestoreError(
            err,
            OperationType.LIST,
            'daily_logbook_entries'
          );
        } catch (e: any) {
          setErrorMessage(e.message);
        }
      }
    );

    const serviceQuery = query(
      collection(db, 'service_records'),
      where('ownerId', '==', uid)
    );
    const unsubService = onSnapshot(
      serviceQuery,
      (snap) => {
        const list: ServiceRecord[] = snap.docs.map((d) => {
          const raw = d.data() as Record<string, any>;
          return normalizeServiceRecord({
            id: d.id,
            ...(raw as Omit<ServiceRecord, 'id'>),
            serviceDate: toIsoStringSafe(raw.serviceDate),
            createdAt: toIsoStringSafe(raw.createdAt, new Date().toISOString()),
            updatedAt: toIsoStringSafe(raw.updatedAt, new Date().toISOString()),
          });
        });
        list.sort((a, b) => {
          if (a.serviceDate !== b.serviceDate) {
            return safeLocaleCompare(b.serviceDate, a.serviceDate);
          }
          return (Number(b.odometerKm) || 0) - (Number(a.odometerKm) || 0);
        });
        setLiveServiceRecords(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'service_records');
        } catch (e: any) {
          setErrorMessage(e.message);
        }
      }
    );

    const complianceQuery = query(
      collection(db, 'compliance_documents'),
      where('ownerId', '==', uid)
    );
    const unsubCompliance = onSnapshot(
      complianceQuery,
      (snap) => {
        const list: ComplianceDocument[] = snap.docs.map((d) => {
          const raw = d.data() as Record<string, any>;
          return normalizeComplianceDocument({
            id: d.id,
            ...(raw as Omit<ComplianceDocument, 'id'>),
            expiryDate: toIsoStringSafe(raw.expiryDate),
            createdAt: toIsoStringSafe(raw.createdAt, new Date().toISOString()),
            updatedAt: toIsoStringSafe(raw.updatedAt, new Date().toISOString()),
          });
        });
        list.sort((a, b) => safeLocaleCompare(b.createdAt, a.createdAt));
        setLiveComplianceDocuments(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'compliance_documents');
        } catch (e: any) {
          setErrorMessage(e.message);
        }
      }
    );

    const mediaQuery = query(
      collection(db, 'vehicle_media'),
      where('ownerId', '==', uid)
    );
    const unsubMedia = onSnapshot(
      mediaQuery,
      (snap) => {
        const list: VehicleMedia[] = snap.docs.map((d) => {
          const raw = d.data() as Record<string, any>;
          return {
            id: d.id,
            ...(raw as Omit<VehicleMedia, 'id'>),
            createdAt: toIsoStringSafe(raw.createdAt, new Date().toISOString()),
            updatedAt: toIsoStringSafe(raw.updatedAt, new Date().toISOString()),
          };
        });
        list.sort(
          (a, b) => (Number(a.angleDegrees) || 0) - (Number(b.angleDegrees) || 0)
        );
        setLiveVehicleMedia(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'vehicle_media');
        } catch (e: any) {
          setErrorMessage(e.message);
        }
      }
    );

    const notifQuery = query(
      collection(db, 'notification_logs'),
      where('ownerId', '==', uid)
    );
    const unsubNotif = onSnapshot(
      notifQuery,
      (snap) => {
        const list: NotificationLog[] = snap.docs.map((d) => {
          const raw = d.data() as Record<string, any>;
          return {
            id: d.id,
            ...(raw as Omit<NotificationLog, 'id'>),
            createdAt: toIsoStringSafe(raw.createdAt, new Date().toISOString()),
            updatedAt: toIsoStringSafe(raw.updatedAt, new Date().toISOString()),
          };
        });
        list.sort((a, b) => safeLocaleCompare(b.createdAt, a.createdAt));
        setLiveNotificationLogs(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'notification_logs');
        } catch (e: any) {
          setErrorMessage(e.message);
        }
      }
    );

    const auditQuery = query(
      collection(db, 'audit_logs'),
      where('ownerId', '==', uid)
    );
    const unsubAudit = onSnapshot(
      auditQuery,
      (snap) => {
        const list: AuditLogItem[] = snap.docs.map((d) => {
          const raw = d.data() as Record<string, any>;
          return {
            id: d.id,
            ...(raw as Omit<AuditLogItem, 'id'>),
            createdAt: toIsoStringSafe(raw.createdAt, new Date().toISOString()),
          };
        });
        list.sort((a, b) => safeLocaleCompare(b.createdAt, a.createdAt));
        setLiveAuditLogs(list.slice(0, 50));
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'audit_logs');
        } catch (e: any) {
          setErrorMessage(e.message);
        }
      }
    );

    const orgMemQuery = query(
      collection(db, 'organization_members'),
      where('ownerId', '==', uid)
    );
    const unsubOrgMem = onSnapshot(
      orgMemQuery,
      (snap) => {
        const list: OrganizationMember[] = snap.docs.map((d) => {
          const raw = d.data() as Record<string, any>;
          return {
            id: d.id,
            ...(raw as Omit<OrganizationMember, 'id'>),
            createdAt: toIsoStringSafe(raw.createdAt, new Date().toISOString()),
            updatedAt: toIsoStringSafe(raw.updatedAt, new Date().toISOString()),
          };
        });
        list.sort((a, b) => safeLocaleCompare(a.createdAt, b.createdAt));
        setLiveOrgMembers(list);
      },
      () => {
        // Ignore if empty
      }
    );

    return () => {
      unsubProfile();
      unsubVehicles();
      unsubDrivers();
      unsubLogbook();
      unsubService();
      unsubCompliance();
      unsubMedia();
      unsubNotif();
      unsubAudit();
      unsubOrgMem();
    };
  }, [authReady, user, isDemoMode]);

  const recordAudit = async (
    action: string,
    entityType: AuditLogItem['entityType'],
    entityId: string,
    summary: string
  ) => {
    const now = new Date().toISOString();
    if (isDemoMode) {
      setDemoAuditLogs((prev) => [
        {
          id: `audit-demo-${Date.now()}`,
          ownerId: 'demo-owner',
          action,
          entityType,
          entityId,
          summary: summary.slice(0, 400),
          createdAt: now,
        },
        ...prev,
      ]);
      return;
    }
    if (!user) return;
    const logRef = doc(collection(db, 'audit_logs'));
    await setDoc(logRef, {
      ownerId: user.uid,
      action: action.slice(0, 80),
      entityType,
      entityId: entityId.slice(0, 128),
      summary: summary.slice(0, 400),
      createdAt: now,
    });
  };

  const signInWithGoogle = async () => {
    setErrorMessage(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const cred = GoogleAuthProvider.credentialFromResult(result);
      if (cred?.accessToken) {
        setDriveAccessToken(cred.accessToken);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Google sign-in failed.');
    }
  };

  const signOut = async () => {
    setErrorMessage(null);
    setIsDemoMode(false);
    setDriveAccessToken(null);
    await firebaseSignOut(auth);
  };

  const updateOwnerProfile = async (
    updates: Partial<
      Pick<
        UserProfile,
        | 'displayName'
        | 'fullName'
        | 'businessName'
        | 'accountMode'
        | 'organizationName'
        | 'alertEmail'
        | 'whatsappNumber'
        | 'alertMilestonesDays'
        | 'customLogbookHeaders'
        | 'defaultDriverSharePct'
        | 'unitPriceMode'
        | 'driverShareMode'
        | 'defaultDriverShareFixed'
        | 'platformEarningsBasis'
        | 'includeDriverShareInExpenses'
        | 'intendedGoogleDriveEmail'
        | 'intendedDriveEmail'
        | 'expiryAlertDays'
        | 'expiryWarningDays'
        | 'serviceWarningKm'
      >
    >
  ) => {
    const now = new Date().toISOString();
    const resolvedDisplayName =
      updates.displayName ?? updates.fullName ?? undefined;
    const resolvedDriveEmail =
      updates.intendedGoogleDriveEmail ??
      updates.intendedDriveEmail ??
      updates.alertEmail ??
      undefined;
    const resolvedExpiryDays =
      updates.expiryAlertDays ?? updates.expiryWarningDays ?? undefined;

    if (isDemoMode || !user) {
      setDemoProfile((prev) => {
        const nextDisp = resolvedDisplayName ?? prev.displayName;
        const nextDrive = resolvedDriveEmail ?? prev.intendedGoogleDriveEmail;
        const nextExp = resolvedExpiryDays ?? prev.expiryAlertDays ?? 30;
        return {
          ...prev,
          ...updates,
          displayName: nextDisp,
          fullName: nextDisp,
          intendedGoogleDriveEmail: nextDrive,
          intendedDriveEmail: nextDrive,
          alertEmail: updates.alertEmail ?? nextDrive ?? prev.alertEmail ?? '',
          whatsappNumber: updates.whatsappNumber ?? prev.whatsappNumber ?? '',
          expiryAlertDays: nextExp,
          expiryWarningDays: nextExp,
          updatedAt: now,
        };
      });
      await recordAudit(
        'PROFILE_UPDATED',
        'Profile',
        'demo-owner',
        `Updated profile (${updates.accountMode || demoProfile.accountMode || 'Organization'}, Email: ${updates.alertEmail || demoProfile.alertEmail || 'not configured'}, WhatsApp: ${updates.whatsappNumber || demoProfile.whatsappNumber || 'not configured'}).`
      );
      return;
    }

    if (!liveProfile) return;
    const profileRef = doc(db, 'profiles', user.uid);
    const payload: Record<string, any> = {
      ownerId: user.uid,
      email: liveProfile.email,
      displayName: (resolvedDisplayName ?? liveProfile.displayName)
        .trim()
        .slice(0, 100),
      businessName: (updates.businessName ?? liveProfile.businessName)
        .trim()
        .slice(0, 120),
      accountMode: updates.accountMode ?? liveProfile.accountMode ?? 'Organization',
      organizationName: (
        updates.organizationName ??
        updates.businessName ??
        liveProfile.organizationName ??
        liveProfile.businessName
      )
        .trim()
        .slice(0, 120),
      alertEmail: (
        updates.alertEmail ??
        resolvedDriveEmail ??
        liveProfile.alertEmail ??
        ''
      )
        .trim()
        .slice(0, 160),
      whatsappNumber: (
        updates.whatsappNumber ??
        liveProfile.whatsappNumber ??
        ''
      )
        .trim()
        .slice(0, 25),
      defaultDriverSharePct: Math.min(
        100,
        Math.max(
          0,
          Number(
            updates.defaultDriverSharePct ?? liveProfile.defaultDriverSharePct
          )
        )
      ),
      unitPriceMode:
        updates.unitPriceMode ?? liveProfile.unitPriceMode ?? 'PER_KM_DERIVED',
      driverShareMode:
        updates.driverShareMode ?? liveProfile.driverShareMode ?? 'PERCENTAGE',
      defaultDriverShareFixed: Math.min(
        1000000,
        Math.max(
          0,
          Number(
            updates.defaultDriverShareFixed ??
              liveProfile.defaultDriverShareFixed ??
              0
          )
        )
      ),
      platformEarningsBasis:
        updates.platformEarningsBasis ??
        liveProfile.platformEarningsBasis ??
        'GROSS',
      includeDriverShareInExpenses:
        updates.includeDriverShareInExpenses ??
        liveProfile.includeDriverShareInExpenses ??
        true,
      currency: 'INR' as const,
      distanceUnit: 'km' as const,
      timezone: 'Asia/Kolkata' as const,
      intendedGoogleDriveEmail: (
        resolvedDriveEmail ?? liveProfile.intendedGoogleDriveEmail
      )
        .trim()
        .slice(0, 160),
      expiryAlertDays: Math.min(
        180,
        Math.max(
          1,
          Number(resolvedExpiryDays ?? liveProfile.expiryAlertDays ?? 30)
        )
      ),
      serviceWarningKm: Math.min(
        10000,
        Math.max(
          100,
          Number(
            updates.serviceWarningKm ?? liveProfile.serviceWarningKm ?? 1000
          )
        )
      ),
      createdAt: liveProfile.createdAt,
      updatedAt: now,
    };

    try {
      await setDoc(profileRef, payload);
      setLiveProfile((prev) =>
        prev
          ? {
              ...prev,
              ...payload,
              customLogbookHeaders:
                updates.customLogbookHeaders ?? prev.customLogbookHeaders,
              alertMilestonesDays:
                updates.alertMilestonesDays ?? prev.alertMilestonesDays,
            }
          : prev
      );
      await recordAudit(
        'PROFILE_UPDATED',
        'Profile',
        user.uid,
        `Updated business configuration (${payload.accountMode}, Alert Email: ${payload.alertEmail}, WhatsApp: ${payload.whatsappNumber}).`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `profiles/${user.uid}`);
    }
  };

  const saveOrganizationMember = async (
    memberData: Omit<
      OrganizationMember,
      'id' | 'ownerId' | 'createdAt' | 'updatedAt'
    >,
    existingId?: string
  ) => {
    const now = new Date().toISOString();
    const pinHash = await resolveMemberPinHash(
      memberData.accessPin || '',
      memberData.accessPinHash
    );
    memberData = { ...memberData, accessPin: '', accessPinHash: pinHash };
    if (isDemoMode || !user) {
      if (existingId) {
        setDemoOrgMembers((prev) =>
          prev.map((m) =>
            m.id === existingId ? { ...m, ...memberData, updatedAt: now } : m
          )
        );
      } else {
        const newMem: OrganizationMember = {
          id: `org-mem-${Date.now()}`,
          ownerId: 'demo-owner',
          ...memberData,
          createdAt: now,
          updatedAt: now,
        };
        setDemoOrgMembers((prev) => [...prev, newMem]);
      }
      await recordAudit(
        existingId ? 'ORG_MEMBER_UPDATED' : 'ORG_MEMBER_CREATED',
        'Profile',
        existingId || 'org-member',
        `Saved organization user "${memberData.fullName}" (${memberData.role}).`
      );
      return;
    }

    const memRef = existingId
      ? doc(db, 'organization_members', existingId)
      : doc(collection(db, 'organization_members'));
    const existing = liveOrgMembers.find((m) => m.id === existingId);
    await setDoc(memRef, {
      ownerId: user.uid,
      fullName: memberData.fullName.trim().slice(0, 100),
      email: memberData.email.trim().slice(0, 160),
      whatsappNumber: memberData.whatsappNumber.trim().slice(0, 25),
      role: memberData.role,
      accessPin: '',
      accessPinHash: pinHash,
      status: memberData.status,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    await recordAudit(
      existingId ? 'ORG_MEMBER_UPDATED' : 'ORG_MEMBER_CREATED',
      'Profile',
      memRef.id,
      `Saved organization user "${memberData.fullName}" (${memberData.role}).`
    );
  };

  const deleteOrganizationMember = async (member: OrganizationMember) => {
    if (isDemoMode || !user) {
      setDemoOrgMembers((prev) => prev.filter((m) => m.id !== member.id));
      if (activeOrgMember?.id === member.id) {
        setActiveOrgMember(null);
      }
      return;
    }
    await deleteDoc(doc(db, 'organization_members', member.id));
  };

  const completePortalSignUpOrLogin = async (params: {
    authAction: 'login' | 'signup' | 'org_member_login';
    accountMode: AccountMode;
    fullName: string;
    organizationName: string;
    email: string;
    whatsappNumber: string;
    passwordOrPin: string;
    role?: OrgMemberRole;
    memberId?: string;
  }) => {
    setErrorMessage(null);
    const now = new Date().toISOString();
    const cleanEmail = (params.email || '').trim();
    const cleanWa = (params.whatsappNumber || '').trim();
    const cleanName = (params.fullName || '').trim();
    const cleanOrg =
      params.accountMode === 'Organization'
        ? (params.organizationName || '').trim()
        : `${cleanName || 'My'} Personal Fleet`;

    const allMembers =
      liveOrgMembers.length > 0 ? liveOrgMembers : demoOrgMembers;

    if (params.authAction === 'org_member_login') {
      const targetMember = findMemberForLogin(allMembers, {
        memberId: params.memberId,
        email: cleanEmail,
        fullName: cleanName,
      });

      if (targetMember) {
        if (
          !(await verifyMemberPin(
            targetMember,
            (params.passwordOrPin || '').trim()
          ))
        ) {
          throw new Error(
            `Invalid Operator Access PIN for ${targetMember.fullName}.`
          );
        }
        setActiveOrgMember(targetMember);
      }
    } else if (params.accountMode === 'Organization') {
      const matched = allMembers.find(
        (m) => m.email.toLowerCase() === cleanEmail.toLowerCase()
      );
      if (matched) {
        setActiveOrgMember(matched);
      } else {
        const requestedPin = (params.passwordOrPin || '').trim();
        if (!requestedPin) {
          throw new Error(
            'A Password / Access PIN is required to create an organization account.'
          );
        }
        const createdMem: OrganizationMember = {
          id: `org-mem-${Date.now()}`,
          ownerId: user?.uid || 'demo-owner',
          fullName: cleanName,
          email: cleanEmail,
          whatsappNumber: cleanWa,
          role: params.role || 'Owner / Admin',
          accessPin: '',
          accessPinHash: await hashPin(requestedPin),
          status: 'Active',
          createdAt: now,
          updatedAt: now,
        };
        setDemoOrgMembers((prev) => [createdMem, ...prev]);
        setActiveOrgMember(createdMem);
      }
    } else {
      setActiveOrgMember(null);
    }

    setDemoProfile((prev) => ({
      ...prev,
      email: cleanEmail,
      displayName: cleanName,
      fullName: cleanName,
      businessName: cleanOrg,
      accountMode: params.accountMode,
      organizationName: cleanOrg,
      alertEmail: cleanEmail,
      whatsappNumber: cleanWa,
      intendedGoogleDriveEmail: cleanEmail,
      intendedDriveEmail: cleanEmail,
      alertMilestonesDays: [10, 5, 1],
      updatedAt: now,
    }));

    if (!user) {
      setIsDemoMode(true);
    } else {
      await updateOwnerProfile({
        displayName: cleanName,
        fullName: cleanName,
        businessName: cleanOrg,
        accountMode: params.accountMode,
        organizationName: cleanOrg,
        alertEmail: cleanEmail,
        whatsappNumber: cleanWa,
        intendedGoogleDriveEmail: cleanEmail,
      });
    }

    await recordAudit(
      params.authAction === 'signup'
        ? 'ACCOUNT_SIGNUP_COMPLETED'
        : 'OPERATOR_LOGIN_COMPLETED',
      'Profile',
      user?.uid || 'demo-owner',
      `${params.accountMode} session started for ${cleanName} (${cleanOrg}) · Alert Email: ${cleanEmail} · WhatsApp: ${cleanWa}.`
    );
  };

  const saveVehicle = async (
    vehicleData: Omit<Vehicle, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => {
    const now = new Date().toISOString();
    const sanitized = {
      registrationNumber: vehicleData.registrationNumber
        .trim()
        .toUpperCase()
        .slice(0, 25),
      make: vehicleData.make.trim().slice(0, 60),
      model: vehicleData.model.trim().slice(0, 60),
      variant: (vehicleData.variant || '').trim().slice(0, 60),
      manufacturingYear: Number(vehicleData.manufacturingYear) || 2024,
      colour: (vehicleData.colour || 'White').trim().slice(0, 40),
      fuelType: vehicleData.fuelType,
      transmission: vehicleData.transmission,
      vehicleType: vehicleData.vehicleType,
      ownershipType: vehicleData.ownershipType,
      purchaseDate: (vehicleData.purchaseDate || '').slice(0, 20),
      purchasePrice: roundCurrency(
        Math.max(0, Number(vehicleData.purchasePrice) || 0)
      ),
      currentOdometerKm: roundKm(
        Math.max(0, Number(vehicleData.currentOdometerKm) || 0)
      ),
      assignedDriverId: (vehicleData.assignedDriverId || '').slice(0, 128),
      assignedDriverName: (vehicleData.assignedDriverName || '').slice(0, 100),
      insuranceProvider: (vehicleData.insuranceProvider || '')
        .trim()
        .slice(0, 100),
      insuranceExpiry: (vehicleData.insuranceExpiry || '').slice(0, 20),
      fcNumber: (vehicleData.fcNumber || '').trim().slice(0, 60),
      fcExpiry: (vehicleData.fcExpiry || '').slice(0, 20),
      permitType: (vehicleData.permitType || '').trim().slice(0, 60),
      permitNumber: (vehicleData.permitNumber || '').trim().slice(0, 60),
      permitExpiry: (vehicleData.permitExpiry || '').slice(0, 20),
      pollutionExpiry: (vehicleData.pollutionExpiry || '').slice(0, 20),
      lastServiceDate: (vehicleData.lastServiceDate || '').slice(0, 20),
      lastServiceOdometerKm: roundKm(
        Math.max(0, Number(vehicleData.lastServiceOdometerKm) || 0)
      ),
      nextServiceDate: (vehicleData.nextServiceDate || '').slice(0, 20),
      nextServiceOdometerKm: roundKm(
        Math.max(0, Number(vehicleData.nextServiceOdometerKm) || 0)
      ),
      serviceIntervalKm: roundKm(
        Math.max(0, Number(vehicleData.serviceIntervalKm) || 10000)
      ),
      notes: (vehicleData.notes || '').trim().slice(0, 1000),
      status: vehicleData.status,
    };

    if (isDemoMode) {
      if (existingId) {
        setDemoVehicles((prev) =>
          prev.map((v) =>
            v.id === existingId ? { ...v, ...sanitized, updatedAt: now } : v
          )
        );
        await recordAudit(
          'VEHICLE_UPDATED',
          'Vehicle',
          existingId,
          `Updated vehicle ${sanitized.registrationNumber} (${sanitized.make} ${sanitized.model}).`
        );
      } else {
        const newId = `veh-demo-${Date.now()}`;
        setDemoVehicles((prev) => [
          ...prev,
          {
            id: newId,
            ownerId: 'demo-owner',
            ...sanitized,
            createdAt: now,
            updatedAt: now,
          },
        ]);
        await recordAudit(
          'VEHICLE_CREATED',
          'Vehicle',
          newId,
          `Added vehicle ${sanitized.registrationNumber} (${sanitized.make} ${sanitized.model}).`
        );
      }
      return;
    }

    if (!user) return;
    const targetRef = existingId
      ? doc(db, 'vehicles', existingId)
      : doc(collection(db, 'vehicles'));
    const existingVehicle = existingId
      ? liveVehicles.find((v) => v.id === existingId)
      : undefined;

    const payload = {
      ownerId: user.uid,
      ...sanitized,
      createdAt: existingVehicle ? existingVehicle.createdAt : now,
      updatedAt: now,
    };

    try {
      await setDoc(targetRef, payload);
      await recordAudit(
        existingId ? 'VEHICLE_UPDATED' : 'VEHICLE_CREATED',
        'Vehicle',
        targetRef.id,
        `${existingId ? 'Updated' : 'Created'} vehicle ${sanitized.registrationNumber} (${sanitized.make} ${sanitized.model}).`
      );
    } catch (err) {
      handleFirestoreError(
        err,
        existingId ? OperationType.UPDATE : OperationType.CREATE,
        `vehicles/${targetRef.id}`
      );
    }
  };

  const setVehicleArchiveStatus = async (
    vehicle: Vehicle,
    status: VehicleStatus
  ) => {
    const { id, ownerId, createdAt, updatedAt, ...rest } = vehicle;
    await saveVehicle({ ...rest, status }, id);
  };

  const updateVehicleOdometer = async (
    vehicle: Vehicle,
    newOdometerKm: number,
    remarks?: string
  ) => {
    const safeOdo = roundKm(Number(newOdometerKm) || 0);
    if (safeOdo < vehicle.currentOdometerKm) {
      throw new Error(
        `Odometer rollback rejected: New reading (${safeOdo} km) cannot be lower than current validated reading (${vehicle.currentOdometerKm} km).`
      );
    }
    const { id, ownerId, createdAt, updatedAt, ...rest } = vehicle;
    const appendedNotes = remarks
      ? `${vehicle.notes ? `${vehicle.notes}\n` : ''}[Odometer Check ${new Date()
          .toISOString()
          .slice(0, 10)}: ${safeOdo} km â ${remarks}]`.slice(0, 1000)
      : vehicle.notes;

    await saveVehicle(
      {
        ...rest,
        currentOdometerKm: safeOdo,
        notes: appendedNotes,
      },
      id
    );
  };

  const saveDriver = async (
    driverData: Omit<Driver, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => {
    const now = new Date().toISOString();
    const sanitized = {
      fullName: driverData.fullName.trim().slice(0, 100),
      phone: driverData.phone.trim().slice(0, 25),
      licenseNumber: driverData.licenseNumber
        .trim()
        .toUpperCase()
        .slice(0, 40),
      licenseExpiry: (driverData.licenseExpiry || '').slice(0, 20),
      defaultSharePct: Math.min(
        100,
        Math.max(0, Number(driverData.defaultSharePct) || 30)
      ),
      assignedVehicleId: (driverData.assignedVehicleId || '').slice(0, 128),
      status: driverData.status,
      notes: (driverData.notes || '').trim().slice(0, 500),
    };

    if (isDemoMode) {
      if (existingId) {
        setDemoDrivers((prev) =>
          prev.map((d) =>
            d.id === existingId ? { ...d, ...sanitized, updatedAt: now } : d
          )
        );
      } else {
        const newId = `drv-demo-${Date.now()}`;
        setDemoDrivers((prev) => [
          ...prev,
          {
            id: newId,
            ownerId: 'demo-owner',
            ...sanitized,
            createdAt: now,
            updatedAt: now,
          },
        ]);
      }
      return;
    }

    if (!user) return;
    const targetRef = existingId
      ? doc(db, 'drivers', existingId)
      : doc(collection(db, 'drivers'));
    const existingDriver = existingId
      ? liveDrivers.find((d) => d.id === existingId)
      : undefined;

    const payload = {
      ownerId: user.uid,
      ...sanitized,
      createdAt: existingDriver ? existingDriver.createdAt : now,
      updatedAt: now,
    };

    try {
      await setDoc(targetRef, payload);
      await recordAudit(
        existingId ? 'DRIVER_UPDATED' : 'DRIVER_CREATED',
        'Driver',
        targetRef.id,
        `${existingId ? 'Updated' : 'Added'} driver ${sanitized.fullName} (License: ${sanitized.licenseNumber}).`
      );
    } catch (err) {
      handleFirestoreError(
        err,
        existingId ? OperationType.UPDATE : OperationType.CREATE,
        `drivers/${targetRef.id}`
      );
    }
  };

  const setDriverArchiveStatus = async (
    driver: Driver,
    status: Driver['status']
  ) => {
    const { id, ownerId, createdAt, updatedAt, ...rest } = driver;
    await saveDriver({ ...rest, status }, id);
  };

  const saveLogbookEntry = async (
    entryData: Record<string, any>,
    existingId?: string
  ) => {
    const now = new Date().toISOString();
    const dateStr = (entryData.date || entryData.entryDate || '').slice(0, 20);
    const startingKm = roundKm(Math.max(0, Number(entryData.startingKm) || 0));
    const endingKm = roundKm(Math.max(0, Number(entryData.endingKm) || 0));
    const earnings = roundCurrency(Math.max(0, Number(entryData.earnings) || 0));
    const driverSharePct = Math.min(
      100,
      Math.max(0, Number(entryData.driverSharePct) || 0)
    );
    const gasFuel = roundCurrency(Math.max(0, Number(entryData.gasFuel) || 0));
    const redTaxi = roundCurrency(Math.max(0, Number(entryData.redTaxi) || 0));
    const toll = roundCurrency(Math.max(0, Number(entryData.toll) || 0));
    const maintenance = roundCurrency(
      Math.max(0, Number(entryData.maintenance) || 0)
    );
    const otherExpenses = roundCurrency(
      Math.max(0, Number(entryData.otherExpenses) || 0)
    );

    // Per-entry calculation options resolve from the owner's profile
    // settings (FzeeLogBook configurable Unit Price, driver share mode,
    // gross-vs-net platform earnings, spec-default expense composition),
    // with per-entry manual overrides when those modes are selected.
    const calcOptions = resolveCalculationOptions(
      isDemoMode ? demoProfile : liveProfile
    );
    const calc = calculateLogbookFinancials(
      {
        startingKm,
        endingKm,
        earnings,
        driverSharePct,
        gasFuel,
        redTaxi,
        toll,
        maintenance,
        otherExpenses,
      },
      {
        ...calcOptions,
        manualUnitPrice:
          calcOptions.unitPriceMode === 'MANUAL'
            ? Number(entryData.manualUnitPrice ?? entryData.unitPrice ?? 0) || 0
            : undefined,
        manualDriverShare:
          calcOptions.driverShareMode === 'MANUAL'
            ? Number(entryData.manualDriverShare ?? entryData.driverShare ?? 0) ||
              0
            : undefined,
      }
    );

    const vehReg = String(
      entryData.vehicleRegistration || entryData.vehicleRegNo || ''
    )
      .trim()
      .toUpperCase()
      .slice(0, 25);

    const sanitized = {
      vehicleId: String(entryData.vehicleId || '').slice(0, 128),
      vehicleRegistration: vehReg,
      driverId: String(entryData.driverId || '').slice(0, 128),
      driverName: String(entryData.driverName || '').trim().slice(0, 100),
      date: dateStr,
      shiftNumber: Math.min(
        10,
        Math.max(1, Math.round(Number(entryData.shiftNumber) || 1))
      ),
      startingKm,
      endingKm,
      kmDay: entryData.kmDay !== undefined ? roundKm(Math.max(0, Number(entryData.kmDay) || 0)) : calc.kmDay,
      attendance: entryData.attendance || 'Present',
      earnings,
      unitPrice: entryData.unitPrice !== undefined ? roundCurrency(Math.max(0, Number(entryData.unitPrice) || 0)) : calc.unitPrice,
      driverSharePct,
      driverShare: entryData.driverShare !== undefined ? roundCurrency(Math.max(0, Number(entryData.driverShare) || 0)) : calc.driverShare,
      gasFuel,
      redTaxi,
      toll,
      maintenance,
      otherExpenses,
      totalExpenses: entryData.totalExpenses !== undefined ? roundCurrency(Math.max(0, Number(entryData.totalExpenses) || 0)) : calc.totalExpenses,
      netBusinessEarnings: entryData.netBusinessEarnings !== undefined ? roundCurrency(Number(entryData.netBusinessEarnings) || 0) : calc.netBusinessEarnings,
      unitPriceMode: calc.unitPriceModeApplied,
      driverShareMode: calc.driverShareModeApplied,
      platformEarningsBasis: calc.commissionDeducted ? 'GROSS' : 'NET_OF_COMMISSION',
      driverShareIncludedInExpenses: calc.driverShareIncludedInExpenses,
      odometerCorrectionReason: String(
        entryData.odometerCorrectionReason || ''
      )
        .trim()
        .slice(0, 300),
      sourceRemarks: String(entryData.sourceRemarks || '').trim().slice(0, 500),
    };

    if (isDemoMode) {
      if (existingId) {
        setDemoLogbookEntries((prev) =>
          prev.map((item) =>
            item.id === existingId
              ? {
                  ...item,
                  ...sanitized,
                  vehicleRegNo: sanitized.vehicleRegistration,
                  entryDate: sanitized.date,
                  updatedAt: now,
                }
              : item
          )
        );
      } else {
        const newId = `log-demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setDemoLogbookEntries((prev) => [
          {
            id: newId,
            ownerId: 'demo-owner',
            ...sanitized,
            vehicleRegNo: sanitized.vehicleRegistration,
            entryDate: sanitized.date,
            createdAt: now,
            updatedAt: now,
          },
          ...prev,
        ]);
      }

      setDemoVehicles((prev) =>
        prev.map((v) =>
          v.id === sanitized.vehicleId &&
          sanitized.endingKm > v.currentOdometerKm
            ? {
                ...v,
                currentOdometerKm: sanitized.endingKm,
                updatedAt: now,
              }
            : v
        )
      );
      await recordAudit(
        existingId ? 'LOGBOOK_UPDATED' : 'LOGBOOK_CREATED',
        'DailyLogbookEntry',
        existingId || 'demo-log',
        `${existingId ? 'Updated' : 'Recorded'} shift log for ${sanitized.vehicleRegistration} on ${sanitized.date} (${sanitized.kmDay} km, Earnings â¹${sanitized.earnings}).`
      );
      return;
    }

    if (!user) return;
    const targetRef = existingId
      ? doc(db, 'daily_logbook_entries', existingId)
      : doc(collection(db, 'daily_logbook_entries'));
    const existingEntry = existingId
      ? liveLogbookEntries.find((e) => e.id === existingId)
      : undefined;

    const payload = {
      ownerId: user.uid,
      ...sanitized,
      createdAt: existingEntry ? existingEntry.createdAt : now,
      updatedAt: now,
    };

    try {
      await setDoc(targetRef, payload);

      const targetVehicle = liveVehicles.find(
        (v) => v.id === sanitized.vehicleId
      );
      if (
        targetVehicle &&
        sanitized.endingKm > targetVehicle.currentOdometerKm
      ) {
        const vehRef = doc(db, 'vehicles', targetVehicle.id);
        await updateDoc(vehRef, {
          currentOdometerKm: sanitized.endingKm,
          updatedAt: now,
        });
      }

      await recordAudit(
        existingId ? 'LOGBOOK_UPDATED' : 'LOGBOOK_CREATED',
        'DailyLogbookEntry',
        targetRef.id,
        `${existingId ? 'Updated' : 'Recorded'} shift log for ${sanitized.vehicleRegistration} on ${sanitized.date} (${sanitized.kmDay} km, Net â¹${sanitized.netBusinessEarnings}).`
      );
    } catch (err) {
      handleFirestoreError(
        err,
        existingId ? OperationType.UPDATE : OperationType.CREATE,
        `daily_logbook_entries/${targetRef.id}`
      );
    }
  };

  const importLogbookEntries = async (
    entries: Array<Record<string, any>>
  ): Promise<number> => {
    let importedCount = 0;
    for (const entry of entries) {
      await saveLogbookEntry(entry);
      importedCount++;
    }
    return importedCount;
  };

  const deleteLogbookEntry = async (entry: DailyLogbookEntry) => {
    const now = new Date().toISOString();
    // When the deleted entry was the source of the vehicle's validated
    // odometer, recompute it from the remaining entries so the register and
    // the vehicle record stay consistent.
    const rollbackOdometer = (
      currentVehicles: Vehicle[],
      allEntries: DailyLogbookEntry[]
    ): number | null => {
      const vehicle = currentVehicles.find((v) => v.id === entry.vehicleId);
      if (!vehicle) return null;
      if (entry.endingKm < vehicle.currentOdometerKm) return null;
      const maxRemaining = allEntries
        .filter((e) => e.vehicleId === entry.vehicleId && e.id !== entry.id)
        .reduce((max, e) => Math.max(max, e.endingKm), entry.startingKm);
      return roundKm(Math.max(0, maxRemaining));
    };

    if (isDemoMode) {
      const rolledBack = rollbackOdometer(demoVehicles, demoLogbookEntries);
      setDemoLogbookEntries((prev) => prev.filter((e) => e.id !== entry.id));
      if (rolledBack !== null) {
        setDemoVehicles((prev) =>
          prev.map((v) =>
            v.id === entry.vehicleId
              ? { ...v, currentOdometerKm: rolledBack, updatedAt: now }
              : v
          )
        );
      }
      await recordAudit(
        'LOGBOOK_DELETED',
        'DailyLogbookEntry',
        entry.id,
        `Deleted logbook entry for ${entry.vehicleRegistration} on ${entry.date}.`
      );
      return;
    }
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'daily_logbook_entries', entry.id));
      const rolledBack = rollbackOdometer(liveVehicles, liveLogbookEntries);
      if (rolledBack !== null) {
        await updateDoc(doc(db, 'vehicles', entry.vehicleId), {
          currentOdometerKm: rolledBack,
          updatedAt: now,
        });
      }
      await recordAudit(
        'LOGBOOK_DELETED',
        'DailyLogbookEntry',
        entry.id,
        `Deleted logbook entry for ${entry.vehicleRegistration} on ${entry.date}.`
      );
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `daily_logbook_entries/${entry.id}`
      );
    }
  };

  const saveServiceRecord = async (
    recordData: Record<string, any>,
    existingId?: string
  ) => {
    const now = new Date().toISOString();
    const partsCost = roundCurrency(
      Math.max(0, Number(recordData.partsCost) || 0)
    );
    const laborCost = roundCurrency(
      Math.max(0, Number(recordData.laborCost) || 0)
    );
    const totalCost = roundCurrency(partsCost + laborCost);
    const odometerKm = roundKm(Math.max(0, Number(recordData.odometerKm) || 0));
    const nextServiceDueKm = roundKm(
      Math.max(
        odometerKm,
        Number(
          recordData.nextServiceDueKm ?? recordData.nextServiceOdometerKm
        ) || odometerKm + 10000
      )
    );
    const vehReg = (
      recordData.vehicleRegistration ||
      recordData.vehicleRegNo ||
      'UNKNOWN'
    )
      .trim()
      .toUpperCase()
      .slice(0, 25);

    const sanitized = {
      vehicleId: String(recordData.vehicleId || '').slice(0, 128),
      vehicleRegistration: vehReg,
      serviceDate: String(recordData.serviceDate || '').slice(0, 20),
      serviceType: recordData.serviceType as ServiceRecord['serviceType'],
      odometerKm,
      nextServiceDueKm,
      nextServiceDueDate: String(
        recordData.nextServiceDueDate ?? recordData.nextServiceDate ?? ''
      ).slice(0, 20),
      workshopName: String(recordData.workshopName || '')
        .trim()
        .slice(0, 120),
      invoiceNumber: String(
        recordData.invoiceNumber ?? recordData.invoiceReference ?? ''
      )
        .trim()
        .slice(0, 60),
      partsCost,
      laborCost,
      totalCost,
      status: (recordData.status || 'Completed') as ServiceRecord['status'],
      notes: String(recordData.notes || '')
        .trim()
        .slice(0, 1000),
    };

    if (isDemoMode) {
      if (existingId) {
        setDemoServiceRecords((prev) =>
          prev.map((r) =>
            r.id === existingId
              ? normalizeServiceRecord({ ...r, ...sanitized, updatedAt: now })
              : r
          )
        );
      } else {
        const newId = `srv-demo-${Date.now()}`;
        setDemoServiceRecords((prev) => [
          normalizeServiceRecord({
            id: newId,
            ownerId: 'demo-owner',
            ...sanitized,
            createdAt: now,
            updatedAt: now,
          }),
          ...prev,
        ]);
      }

      if (sanitized.status === 'Completed') {
        setDemoVehicles((prev) =>
          prev.map((v) => {
            if (v.id !== sanitized.vehicleId) return v;
            const shouldUpdateService =
              !v.lastServiceDate ||
              sanitized.serviceDate >= v.lastServiceDate ||
              sanitized.odometerKm >= v.lastServiceOdometerKm;
            return {
              ...v,
              currentOdometerKm: Math.max(
                v.currentOdometerKm,
                sanitized.odometerKm
              ),
              lastServiceDate: shouldUpdateService
                ? sanitized.serviceDate
                : v.lastServiceDate,
              lastServiceOdometerKm: shouldUpdateService
                ? sanitized.odometerKm
                : v.lastServiceOdometerKm,
              nextServiceDate:
                shouldUpdateService && sanitized.nextServiceDueDate
                  ? sanitized.nextServiceDueDate
                  : v.nextServiceDate,
              nextServiceOdometerKm: shouldUpdateService
                ? sanitized.nextServiceDueKm
                : v.nextServiceOdometerKm,
              updatedAt: now,
            };
          })
        );
      }

      await recordAudit(
        existingId ? 'SERVICE_UPDATED' : 'SERVICE_RECORDED',
        'ServiceRecord',
        existingId || 'demo-srv',
        `${existingId ? 'Updated' : 'Logged'} ${sanitized.serviceType} for ${
          sanitized.vehicleRegistration
        } at ${sanitized.odometerKm} km (â¹${sanitized.totalCost}).`
      );
      return;
    }

    if (!user) return;
    const targetRef = existingId
      ? doc(db, 'service_records', existingId)
      : doc(collection(db, 'service_records'));
    const existingRec = existingId
      ? liveServiceRecords.find((r) => r.id === existingId)
      : undefined;

    const payload = {
      ownerId: user.uid,
      ...sanitized,
      createdAt: existingRec ? existingRec.createdAt : now,
      updatedAt: now,
    };

    try {
      await setDoc(targetRef, payload);

      const targetVehicle = liveVehicles.find(
        (v) => v.id === sanitized.vehicleId
      );
      if (targetVehicle && sanitized.status === 'Completed') {
        const shouldUpdateService =
          !targetVehicle.lastServiceDate ||
          sanitized.serviceDate >= targetVehicle.lastServiceDate ||
          sanitized.odometerKm >= targetVehicle.lastServiceOdometerKm;

        const vehUpdates: Record<string, any> = {
          currentOdometerKm: Math.max(
            targetVehicle.currentOdometerKm,
            sanitized.odometerKm
          ),
          updatedAt: now,
        };
        if (shouldUpdateService) {
          vehUpdates.lastServiceDate = sanitized.serviceDate;
          vehUpdates.lastServiceOdometerKm = sanitized.odometerKm;
          vehUpdates.nextServiceOdometerKm = sanitized.nextServiceDueKm;
          if (sanitized.nextServiceDueDate) {
            vehUpdates.nextServiceDate = sanitized.nextServiceDueDate;
          }
        }
        await updateDoc(doc(db, 'vehicles', targetVehicle.id), vehUpdates);
      }

      await recordAudit(
        existingId ? 'SERVICE_UPDATED' : 'SERVICE_RECORDED',
        'ServiceRecord',
        targetRef.id,
        `${existingId ? 'Updated' : 'Logged'} ${sanitized.serviceType} for ${
          sanitized.vehicleRegistration
        } at ${sanitized.odometerKm} km (â¹${sanitized.totalCost}).`
      );
    } catch (err) {
      handleFirestoreError(
        err,
        existingId ? OperationType.UPDATE : OperationType.CREATE,
        `service_records/${targetRef.id}`
      );
    }
  };

  const deleteServiceRecord = async (record: ServiceRecord) => {
    if (isDemoMode) {
      setDemoServiceRecords((prev) => prev.filter((r) => r.id !== record.id));
      await recordAudit(
        'SERVICE_DELETED',
        'ServiceRecord',
        record.id,
        `Deleted service record (${record.serviceType}) for ${record.vehicleRegistration} on ${record.serviceDate}.`
      );
      return;
    }
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'service_records', record.id));
      await recordAudit(
        'SERVICE_DELETED',
        'ServiceRecord',
        record.id,
        `Deleted service record (${record.serviceType}) for ${record.vehicleRegistration} on ${record.serviceDate}.`
      );
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `service_records/${record.id}`
      );
    }
  };

  const saveComplianceDocument = async (
    docData: Record<string, any>,
    existingId?: string
  ) => {
    const now = new Date().toISOString();
    const rawType =
      docData.targetType ||
      (docData.entityType === 'driver' ? 'Driver' : 'Vehicle');
    const rawDocType =
      docData.documentType || docData.documentCategory || 'Insurance Policy';

    const sanitized = {
      targetType: rawType as ComplianceDocument['targetType'],
      targetId: String(docData.targetId || docData.entityId || '').slice(
        0,
        128
      ),
      targetLabel: String(
        docData.targetLabel || docData.entityLabel || 'Vehicle'
      )
        .trim()
        .slice(0, 100),
      documentType: rawDocType as ComplianceDocument['documentType'],
      documentNumber: String(docData.documentNumber || '')
        .trim()
        .toUpperCase()
        .slice(0, 80),
      providerOrAuthority: String(
        docData.providerOrAuthority || docData.issuingAuthority || ''
      )
        .trim()
        .slice(0, 120),
      issueDate: String(docData.issueDate || '').slice(0, 20),
      expiryDate: String(docData.expiryDate || '').slice(0, 20),
      premiumOrFee: roundCurrency(
        Math.max(
          0,
          Number(docData.premiumOrFee ?? docData.renewalCost ?? 0) || 0
        )
      ),
      fileName: String(docData.fileName || '')
        .trim()
        .slice(0, 160),
      fileMimeType: String(docData.fileMimeType || '')
        .trim()
        .slice(0, 80),
      fileSizeBytes: Math.min(
        20000000,
        Math.max(0, Math.round(Number(docData.fileSizeBytes) || 0))
      ),
      fileDataUrl: String(
        docData.fileDataUrl || docData.verificationDigest || ''
      ).slice(0, 150000),
      status: (docData.status || 'Active') as ComplianceDocument['status'],
      notes: String(docData.notes || '')
        .trim()
        .slice(0, 500),
    };

    if (isDemoMode) {
      if (existingId) {
        setDemoComplianceDocuments((prev) =>
          prev.map((d) =>
            d.id === existingId
              ? normalizeComplianceDocument({
                  ...d,
                  ...sanitized,
                  updatedAt: now,
                })
              : d
          )
        );
      } else {
        const newId = `doc-demo-${Date.now()}`;
        setDemoComplianceDocuments((prev) => [
          normalizeComplianceDocument({
            id: newId,
            ownerId: 'demo-owner',
            ...sanitized,
            createdAt: now,
            updatedAt: now,
          }),
          ...prev.map((oldDoc) =>
            !existingId &&
            sanitized.status === 'Active' &&
            oldDoc.targetId === sanitized.targetId &&
            oldDoc.documentType === sanitized.documentType &&
            oldDoc.status === 'Active'
              ? {
                  ...oldDoc,
                  status: 'Superseded' as const,
                  updatedAt: now,
                }
              : oldDoc
          ),
        ]);
      }

      if (sanitized.status === 'Active') {
        if (sanitized.targetType === 'Vehicle') {
          setDemoVehicles((prev) =>
            prev.map((v) => {
              if (v.id !== sanitized.targetId) return v;
              const nextVeh = { ...v, updatedAt: now };
              if (sanitized.documentType === 'Insurance Policy') {
                nextVeh.insuranceExpiry = sanitized.expiryDate;
                if (sanitized.providerOrAuthority) {
                  nextVeh.insuranceProvider = sanitized.providerOrAuthority;
                }
              } else if (
                sanitized.documentType === 'Fitness Certificate (FC)'
              ) {
                nextVeh.fcExpiry = sanitized.expiryDate;
                nextVeh.fcNumber = sanitized.documentNumber;
              } else if (sanitized.documentType === 'Permit Certificate') {
                nextVeh.permitExpiry = sanitized.expiryDate;
                nextVeh.permitNumber = sanitized.documentNumber;
              } else if (
                sanitized.documentType === 'Pollution Certificate (PUCC)'
              ) {
                nextVeh.pollutionExpiry = sanitized.expiryDate;
              }
              return nextVeh;
            })
          );
        } else if (
          sanitized.targetType === 'Driver' &&
          sanitized.documentType === 'Driver Licence'
        ) {
          setDemoDrivers((prev) =>
            prev.map((drv) =>
              drv.id === sanitized.targetId
                ? {
                    ...drv,
                    licenseNumber: sanitized.documentNumber,
                    licenseExpiry: sanitized.expiryDate,
                    updatedAt: now,
                  }
                : drv
            )
          );
        }
      }

      await recordAudit(
        existingId ? 'DOCUMENT_UPDATED' : 'DOCUMENT_UPLOADED',
        'ComplianceDocument',
        existingId || 'demo-doc',
        `${existingId ? 'Updated' : 'Uploaded'} ${sanitized.documentType} (${
          sanitized.documentNumber
        }) for ${sanitized.targetLabel}, valid until ${sanitized.expiryDate}.`
      );
      return;
    }

    if (!user) return;
    const targetRef = existingId
      ? doc(db, 'compliance_documents', existingId)
      : doc(collection(db, 'compliance_documents'));
    const existingDoc = existingId
      ? liveComplianceDocuments.find((d) => d.id === existingId)
      : undefined;

    const payload = {
      ownerId: user.uid,
      ...sanitized,
      createdAt: existingDoc ? existingDoc.createdAt : now,
      updatedAt: now,
    };

    try {
      await setDoc(targetRef, payload);

      if (!existingId && sanitized.status === 'Active') {
        const priorActiveDocs = liveComplianceDocuments.filter(
          (d) =>
            d.id !== targetRef.id &&
            d.targetId === sanitized.targetId &&
            d.documentType === sanitized.documentType &&
            d.status === 'Active'
        );
        for (const oldDoc of priorActiveDocs) {
          await updateDoc(doc(db, 'compliance_documents', oldDoc.id), {
            status: 'Superseded',
            updatedAt: now,
          });
        }
      }

      if (sanitized.status === 'Active') {
        if (sanitized.targetType === 'Vehicle') {
          const veh = liveVehicles.find((v) => v.id === sanitized.targetId);
          if (veh) {
            const vehUpdates: Record<string, any> = { updatedAt: now };
            if (sanitized.documentType === 'Insurance Policy') {
              vehUpdates.insuranceExpiry = sanitized.expiryDate;
              if (sanitized.providerOrAuthority) {
                vehUpdates.insuranceProvider = sanitized.providerOrAuthority;
              }
            } else if (sanitized.documentType === 'Fitness Certificate (FC)') {
              vehUpdates.fcExpiry = sanitized.expiryDate;
              vehUpdates.fcNumber = sanitized.documentNumber;
            } else if (sanitized.documentType === 'Permit Certificate') {
              vehUpdates.permitExpiry = sanitized.expiryDate;
              vehUpdates.permitNumber = sanitized.documentNumber;
            } else if (
              sanitized.documentType === 'Pollution Certificate (PUCC)'
            ) {
              vehUpdates.pollutionExpiry = sanitized.expiryDate;
            }
            await updateDoc(doc(db, 'vehicles', veh.id), vehUpdates);
          }
        } else if (
          sanitized.targetType === 'Driver' &&
          sanitized.documentType === 'Driver Licence'
        ) {
          const drv = liveDrivers.find((d) => d.id === sanitized.targetId);
          if (drv) {
            await updateDoc(doc(db, 'drivers', drv.id), {
              licenseNumber: sanitized.documentNumber,
              licenseExpiry: sanitized.expiryDate,
              updatedAt: now,
            });
          }
        }
      }

      await recordAudit(
        existingId ? 'DOCUMENT_UPDATED' : 'DOCUMENT_UPLOADED',
        'ComplianceDocument',
        targetRef.id,
        `${existingId ? 'Updated' : 'Uploaded'} ${sanitized.documentType} (${
          sanitized.documentNumber
        }) for ${sanitized.targetLabel}, valid until ${sanitized.expiryDate}.`
      );
    } catch (err) {
      handleFirestoreError(
        err,
        existingId ? OperationType.UPDATE : OperationType.CREATE,
        `compliance_documents/${targetRef.id}`
      );
    }
  };

  const deleteComplianceDocument = async (docRecord: ComplianceDocument) => {
    if (isDemoMode) {
      setDemoComplianceDocuments((prev) =>
        prev.filter((d) => d.id !== docRecord.id)
      );
      await recordAudit(
        'DOCUMENT_DELETED',
        'ComplianceDocument',
        docRecord.id,
        `Deleted compliance document ${docRecord.documentType} (${docRecord.documentNumber}) for ${docRecord.targetLabel}.`
      );
      return;
    }
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'compliance_documents', docRecord.id));
      await recordAudit(
        'DOCUMENT_DELETED',
        'ComplianceDocument',
        docRecord.id,
        `Deleted compliance document ${docRecord.documentType} (${docRecord.documentNumber}) for ${docRecord.targetLabel}.`
      );
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `compliance_documents/${docRecord.id}`
      );
    }
  };

  const saveVehicleMedia = async (
    mediaData: Omit<
      VehicleMedia,
      'id' | 'ownerId' | 'createdAt' | 'updatedAt'
    >,
    existingId?: string
  ) => {
    const now = new Date().toISOString();
    const sanitized = {
      vehicleId: mediaData.vehicleId.slice(0, 128),
      registrationNumber: mediaData.registrationNumber
        .trim()
        .toUpperCase()
        .slice(0, 25),
      mediaCategory: mediaData.mediaCategory,
      angleLabel: mediaData.angleLabel,
      angleDegrees: Math.min(
        360,
        Math.max(0, roundKm(Number(mediaData.angleDegrees) || 0))
      ),
      fileName: mediaData.fileName.trim().slice(0, 160),
      mimeType: mediaData.mimeType,
      fileSizeBytes: Math.min(
        52428800,
        Math.max(0, Math.round(Number(mediaData.fileSizeBytes) || 0))
      ),
      dataUrl: (mediaData.dataUrl || '').slice(0, 250000),
      storagePath: (mediaData.storagePath || '').trim().slice(0, 300),
      notes: (mediaData.notes || '').trim().slice(0, 500),
    };

    if (isDemoMode) {
      if (existingId) {
        setDemoVehicleMedia((prev) =>
          prev.map((m) =>
            m.id === existingId ? { ...m, ...sanitized, updatedAt: now } : m
          )
        );
      } else {
        const newId = `media-demo-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        setDemoVehicleMedia((prev) => {
          const filtered =
            sanitized.mediaCategory === 'AnglePhoto' &&
            sanitized.angleLabel !== 'Custom'
              ? prev.filter(
                  (item) =>
                    !(
                      item.vehicleId === sanitized.vehicleId &&
                      item.mediaCategory === 'AnglePhoto' &&
                      item.angleLabel === sanitized.angleLabel
                    )
                )
              : sanitized.mediaCategory === 'AICalibration'
              ? prev.filter(
                  (item) =>
                    !(
                      item.vehicleId === sanitized.vehicleId &&
                      item.mediaCategory === 'AICalibration'
                    )
                )
              : prev;
          return [
            ...filtered,
            {
              id: newId,
              ownerId: 'demo-owner',
              ...sanitized,
              createdAt: now,
              updatedAt: now,
            },
          ];
        });
      }

      await recordAudit(
        existingId ? 'VEHICLE_MEDIA_UPDATED' : 'VEHICLE_MEDIA_ADDED',
        'VehicleMedia',
        existingId || 'demo-media',
        `${existingId ? 'Updated' : 'Saved'} ${sanitized.mediaCategory} (${
          sanitized.angleLabel
        }) for ${sanitized.registrationNumber}.`
      );
      return;
    }

    if (!user) return;
    const existingSlotDoc =
      !existingId &&
      ((sanitized.mediaCategory === 'AnglePhoto' &&
        sanitized.angleLabel !== 'Custom') ||
        sanitized.mediaCategory === 'AICalibration')
        ? liveVehicleMedia.find(
            (m) =>
              m.vehicleId === sanitized.vehicleId &&
              m.mediaCategory === sanitized.mediaCategory &&
              (sanitized.mediaCategory === 'AICalibration' ||
                m.angleLabel === sanitized.angleLabel)
          )
        : undefined;

    const resolvedId = existingId || existingSlotDoc?.id;
    const targetRef = resolvedId
      ? doc(db, 'vehicle_media', resolvedId)
      : doc(collection(db, 'vehicle_media'));
    const existingDoc = resolvedId
      ? liveVehicleMedia.find((m) => m.id === resolvedId)
      : undefined;

    const payload = {
      ownerId: user.uid,
      ...sanitized,
      createdAt: existingDoc ? existingDoc.createdAt : now,
      updatedAt: now,
    };

    try {
      await setDoc(targetRef, payload);
      await recordAudit(
        resolvedId ? 'VEHICLE_MEDIA_UPDATED' : 'VEHICLE_MEDIA_ADDED',
        'VehicleMedia',
        targetRef.id,
        `${resolvedId ? 'Updated' : 'Uploaded'} ${sanitized.mediaCategory} (${
          sanitized.fileName
        }) for ${sanitized.registrationNumber}.`
      );
    } catch (err) {
      handleFirestoreError(
        err,
        resolvedId ? OperationType.UPDATE : OperationType.CREATE,
        `vehicle_media/${targetRef.id}`
      );
    }
  };

  const deleteVehicleMedia = async (mediaItem: VehicleMedia) => {
    if (isDemoMode) {
      setDemoVehicleMedia((prev) => prev.filter((m) => m.id !== mediaItem.id));
      await recordAudit(
        'VEHICLE_MEDIA_DELETED',
        'VehicleMedia',
        mediaItem.id,
        `Removed ${mediaItem.mediaCategory} (${mediaItem.fileName}) for ${mediaItem.registrationNumber}.`
      );
      return;
    }
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'vehicle_media', mediaItem.id));
      await recordAudit(
        'VEHICLE_MEDIA_DELETED',
        'VehicleMedia',
        mediaItem.id,
        `Removed ${mediaItem.mediaCategory} (${mediaItem.fileName}) for ${mediaItem.registrationNumber}.`
      );
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `vehicle_media/${mediaItem.id}`
      );
    }
  };

  const saveNotificationLog = async (
    notifData: Omit<
      NotificationLog,
      'id' | 'ownerId' | 'createdAt' | 'updatedAt'
    >,
    existingId?: string
  ) => {
    const now = new Date().toISOString();
    const sanitized = {
      alertType: notifData.alertType,
      severity: notifData.severity,
      targetLabel: notifData.targetLabel.trim().slice(0, 120),
      title: notifData.title.trim().slice(0, 160),
      message: notifData.message.trim().slice(0, 800),
      recipientEmail: (notifData.recipientEmail || '')
        .trim()
        .slice(0, 160),
      channel: notifData.channel,
      status: notifData.status,
    };

    if (isDemoMode) {
      if (existingId) {
        setDemoNotificationLogs((prev) =>
          prev.map((n) =>
            n.id === existingId ? { ...n, ...sanitized, updatedAt: now } : n
          )
        );
      } else {
        const newId = `notif-demo-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 5)}`;
        setDemoNotificationLogs((prev) => [
          {
            id: newId,
            ownerId: 'demo-owner',
            ...sanitized,
            createdAt: now,
            updatedAt: now,
          },
          ...prev,
        ]);
      }
      await recordAudit(
        existingId ? 'NOTIFICATION_UPDATED' : 'NOTIFICATION_LOGGED',
        'NotificationLog',
        existingId || 'demo-notif',
        `${sanitized.channel}: ${sanitized.title} (${sanitized.status}).`
      );
      return;
    }

    if (!user) return;
    const targetRef = existingId
      ? doc(db, 'notification_logs', existingId)
      : doc(collection(db, 'notification_logs'));
    const existingDoc = existingId
      ? liveNotificationLogs.find((n) => n.id === existingId)
      : undefined;

    const payload = {
      ownerId: user.uid,
      ...sanitized,
      createdAt: existingDoc ? existingDoc.createdAt : now,
      updatedAt: now,
    };

    try {
      await setDoc(targetRef, payload);
      await recordAudit(
        existingId ? 'NOTIFICATION_UPDATED' : 'NOTIFICATION_LOGGED',
        'NotificationLog',
        targetRef.id,
        `${sanitized.channel}: ${sanitized.title} (${sanitized.status}).`
      );
    } catch (err) {
      handleFirestoreError(
        err,
        existingId ? OperationType.UPDATE : OperationType.CREATE,
        `notification_logs/${targetRef.id}`
      );
    }
  };

  const updateNotificationStatus = async (
    notification: NotificationLog,
    status: NotificationStatus
  ) => {
    const { id, ownerId, createdAt, updatedAt, ...rest } = notification;
    await saveNotificationLog({ ...rest, status }, id);
  };

  const deleteNotificationLog = async (notification: NotificationLog) => {
    if (isDemoMode) {
      setDemoNotificationLogs((prev) =>
        prev.filter((n) => n.id !== notification.id)
      );
      await recordAudit(
        'NOTIFICATION_DELETED',
        'NotificationLog',
        notification.id,
        `Deleted notification log "${notification.title}".`
      );
      return;
    }
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'notification_logs', notification.id));
      await recordAudit(
        'NOTIFICATION_DELETED',
        'NotificationLog',
        notification.id,
        `Deleted notification log "${notification.title}".`
      );
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `notification_logs/${notification.id}`
      );
    }
  };

  const restoreFleetSnapshot = async (snapshot: {
    vehicles?: Vehicle[];
    drivers?: Driver[];
    dailyLogbookEntries?: DailyLogbookEntry[];
    serviceRecords?: ServiceRecord[];
    complianceDocuments?: ComplianceDocument[];
  }) => {
    let vehiclesRestored = 0;
    let driversRestored = 0;
    let entriesRestored = 0;
    let servicesRestored = 0;
    let docsRestored = 0;

    for (const v of snapshot.vehicles || []) {
      const { id, ownerId: _o, createdAt: _c, updatedAt: _u, ...rest } = v;
      await saveVehicle(rest as any, id);
      vehiclesRestored++;
    }
    for (const d of snapshot.drivers || []) {
      const { id, ownerId: _o, createdAt: _c, updatedAt: _u, ...rest } = d;
      await saveDriver(rest as any, id);
      driversRestored++;
    }
    for (const e of snapshot.dailyLogbookEntries || []) {
      const { id, ownerId: _o, createdAt: _c, updatedAt: _u, ...rest } = e;
      await saveLogbookEntry(rest, id);
      entriesRestored++;
    }
    for (const s of snapshot.serviceRecords || []) {
      const { id, ownerId: _o, createdAt: _c, updatedAt: _u, ...rest } = s;
      await saveServiceRecord(rest, id);
      servicesRestored++;
    }
    for (const c of snapshot.complianceDocuments || []) {
      const { id, ownerId: _o, createdAt: _c, updatedAt: _u, ...rest } = c;
      await saveComplianceDocument(rest, id);
      docsRestored++;
    }

    await recordAudit(
      'BACKUP_SNAPSHOT_RESTORED',
      'Profile',
      user?.uid || 'demo-owner',
      `Restored backup snapshot: ${vehiclesRestored} vehicles, ${driversRestored} drivers, ${entriesRestored} logbook shifts, ${servicesRestored} service records, ${docsRestored} compliance docs.`
    );

    return {
      vehiclesRestored,
      driversRestored,
      entriesRestored,
      servicesRestored,
      docsRestored,
    };
  };

  const value: FleetContextValue = {
    user,
    authReady,
    isDemoMode,
    setDemoMode: setIsDemoMode,
    setIsDemoMode,
    profile: isDemoMode ? demoProfile : liveProfile,
    vehicles: isDemoMode ? demoVehicles : liveVehicles,
    drivers: isDemoMode ? demoDrivers : liveDrivers,
    logbookEntries: isDemoMode ? demoLogbookEntries : liveLogbookEntries,
    serviceRecords: isDemoMode ? demoServiceRecords : liveServiceRecords,
    complianceDocuments: isDemoMode
      ? demoComplianceDocuments
      : liveComplianceDocuments,
    vehicleMedia: isDemoMode ? demoVehicleMedia : liveVehicleMedia,
    notificationLogs: isDemoMode ? demoNotificationLogs : liveNotificationLogs,
    auditLogs: isDemoMode ? demoAuditLogs : liveAuditLogs,
    loadingData,
    dataLoading: loadingData,
    errorMessage,
    errorBanner: errorMessage,
    clearError: () => setErrorMessage(null),
    clearErrorBanner: () => setErrorMessage(null),
    signInWithGoogle,
    signOut,
    organizationMembers:
      isDemoMode || liveOrgMembers.length === 0
        ? demoOrgMembers
        : liveOrgMembers,
    activeOrgMember,
    setActiveOrgMember,
    saveOrganizationMember,
    deleteOrganizationMember,
    completePortalSignUpOrLogin,
    updateOwnerProfile,
    updateProfileConfig: updateOwnerProfile,
    saveVehicle,
    setVehicleArchiveStatus,
    updateVehicleOdometer,
    saveDriver,
    setDriverArchiveStatus,
    saveLogbookEntry,
    importLogbookEntries,
    deleteLogbookEntry,
    saveServiceRecord,
    deleteServiceRecord,
    saveComplianceDocument,
    deleteComplianceDocument,
    saveVehicleMedia,
    deleteVehicleMedia,
    saveNotificationLog,
    updateNotificationStatus,
    deleteNotificationLog,
    restoreFleetSnapshot,
  };

  return (
    <FleetContext.Provider value={value}>{children}</FleetContext.Provider>
  );
};

export function useFleet(): FleetContextValue {
  const ctx = useContext(FleetContext);
  if (!ctx) {
    throw new Error('useFleet must be used within a FleetProvider');
  }
  return ctx;
}
