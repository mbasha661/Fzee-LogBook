import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// CRITICAL: Initialize Firestore with the named database ID from firebase-applet-config.json
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

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

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;
