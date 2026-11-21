/// <reference types="vite/client" />
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  doc,
  getDocFromServer,
  collection,
  addDoc,
  deleteDoc,
  query,
  where,
  getDocs,
} from 'firebase/firestore';

interface FirebaseAppletConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
  firestoreDatabaseId?: string;
}

// Build-safe optional load: uses firebase-applet-config.json when present (AI Studio),
// and falls back to VITE_FIREBASE_* env vars on Vercel / external deployments.
const localConfigModules = import.meta.glob<{ default: FirebaseAppletConfig }>(
  '../../firebase-applet-config.json',
  { eager: true }
);
const localConfig: FirebaseAppletConfig =
  Object.values(localConfigModules)[0]?.default ?? {};

const envConfig: FirebaseAppletConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID,
};

const firebaseConfig: FirebaseAppletConfig = localConfig.apiKey
  ? localConfig
  : envConfig;

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

let app: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  dbInstance = firebaseConfig.firestoreDatabaseId
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);
  authInstance = getAuth(app);
}

export const db = dbInstance;
export const auth = authInstance;
export const googleProvider = new GoogleAuthProvider();

async function testConnection() {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export const signInWithGoogle = () => {
  if (!auth) {
    return Promise.reject(
      new Error(
        'Firebase är inte konfigurerat i denna miljö. Lägg till VITE_FIREBASE_* miljövariabler för molninloggning.'
      )
    );
  }
  return signInWithPopup(auth, googleProvider);
};

export const logout = () => {
  if (!auth) return Promise.resolve();
  return signOut(auth);
};

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
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
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

export interface SavedReport {
  id: string;
  timestamp: string;
  content: string;
  status: 'RÖD' | 'GUL' | 'GRÖN';
  metric: string;
  datasetName?: string;
  sampleCount?: number;
  userId: string;
}

export async function fetchUserReports(userId: string): Promise<SavedReport[]> {
  if (!db) return [];
  try {
    const q = query(collection(db, 'reports'), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const items = snapshot.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<SavedReport, 'id'>),
    }));
    items.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return items.slice(0, 30);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'reports');
    return [];
  }
}

export async function saveUserReport(input: {
  content: string;
  status: 'RÖD' | 'GUL' | 'GRÖN';
  metric: string;
  datasetName: string;
  sampleCount: number;
  userId: string;
}): Promise<void> {
  if (!db) return;
  try {
    await addDoc(collection(db, 'reports'), {
      timestamp: new Date().toISOString(),
      content: input.content.slice(0, 99000),
      status: input.status,
      metric: input.metric.slice(0, 100),
      datasetName: (input.datasetName || 'Dataset').slice(0, 200),
      sampleCount: Math.max(0, Math.min(1_000_000, Math.floor(input.sampleCount))),
      userId: input.userId,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'reports');
  }
}

export async function deleteUserReport(reportId: string): Promise<void> {
  if (!db) return;
  try {
    await deleteDoc(doc(db, 'reports', reportId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `reports/${reportId}`);
  }
}
