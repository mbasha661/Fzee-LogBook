import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  User,
} from 'firebase/auth';
import { deriveMemberPassword } from './security';
import {
  getFirestore,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
// Public Firebase web configuration is supplied at build time, never injected by a host.
export const firebaseConfigured = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID &&
  import.meta.env.VITE_FIREBASE_APP_ID
);
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo.localhost',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-fzeelogbook',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || 'demo-app',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  firestoreDatabaseId: import.meta.env.VITE_FIRESTORE_DATABASE_ID || '(default)',
};

export const FIREBASE_CONFIG = firebaseConfig;
const app = initializeApp(firebaseConfig);

/**
 * Creates (or reuses) a Firebase Auth account for an organization member,
 * without disturbing the primary signed-in session. The password is derived
 * deterministically from the member's access PIN, so the same PIN always maps
 * to the same account. On email-already-in-use, a successful sign-in with the
 * derived password proves the same PIN and the existing account is reused;
 * any other failure (e.g. a different PIN was used before) is surfaced.
 */
export async function provisionMemberAuthAccount(
  email: string,
  pin: string
): Promise<string> {
  const secondary = initializeApp(firebaseConfig, `member-provision-${Date.now()}`);
  try {
    const secondaryAuth = getAuth(secondary);
    const password = deriveMemberPassword(pin);
    try {
      const created = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      return created.user.uid;
    } catch (err: any) {
      if (err?.code === 'auth/email-already-in-use') {
        const existing = await signInWithEmailAndPassword(secondaryAuth, email, password);
        return existing.user.uid;
      }
      throw err;
    }
  } finally {
    await deleteApp(secondary).catch(() => undefined);
  }
}

// Supports the default database or an explicitly configured named database.
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const authPersistenceReady = setPersistence(auth, browserSessionPersistence);

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export const googleProvider = new GoogleAuthProvider();
SCOPES.forEach((scope) => googleProvider.addScope(scope));

// In-memory cache for Google Drive OAuth access token (never stored in localStorage/sessionStorage)
let cachedDriveAccessToken: string | null = null;
let isSigningInWithGoogle = false;

onAuthStateChanged(auth, (user: User | null) => {
  if (!user && !isSigningInWithGoogle) {
    cachedDriveAccessToken = null;
  }
});

export function getDriveAccessToken(): string | null {
  return cachedDriveAccessToken;
}

export function setDriveAccessToken(token: string | null): void {
  cachedDriveAccessToken = token;
}

export async function connectGoogleDriveOAuth(): Promise<{
  user: User;
  accessToken: string;
}> {
  if (!firebaseConfigured) throw new Error('Configure Firebase in .env before connecting Google Drive.');
  try {
    isSigningInWithGoogle = true;
    const provider = new GoogleAuthProvider();
    SCOPES.forEach((scope) => provider.addScope(scope));
    provider.setCustomParameters({
      prompt: 'consent',
    });
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'Google Sign-In succeeded, but no Google Drive access token was returned. Please grant Google Drive permission when prompted.'
      );
    }
    cachedDriveAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedDriveAccessToken };
  } finally {
    isSigningInWithGoogle = false;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;
