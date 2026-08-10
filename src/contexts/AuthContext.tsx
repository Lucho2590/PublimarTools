'use client';

import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { useFirestore } from 'reactfire';
import { doc, getDoc } from 'firebase/firestore';
import { app } from '@/lib/firebase';
import collections from '@/lib/collections';
import { TUser, EUserRole } from '@/types/user';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  userData: TUser | null;
  userRole: EUserRole | null;
  loadingUserData: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Componente interno que usa los hooks de ReactFire (debe estar dentro de FirestoreProvider)
function AuthProviderInner({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const auth = getAuth(app);
  const firestore = useFirestore();

  // Estados para datos del usuario desde Firestore
  const [userDataFromFirestore, setUserDataFromFirestore] = useState<any>(null);
  const [loadingUserData, setLoadingUserData] = useState(false);

  // Obtener datos del usuario desde Firestore cuando está autenticado
  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) {
        setUserDataFromFirestore(null);
        setLoadingUserData(false);
        return;
      }

      setLoadingUserData(true);
      try {
        const userDocRef = doc(firestore, collections.USERS, user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          setUserDataFromFirestore({ id: userDoc.id, ...userDoc.data() });
        } else {
          setUserDataFromFirestore(null);
        }
      } catch (error) {
        console.error('Error al obtener datos del usuario:', error);
        setUserDataFromFirestore(null);
      } finally {
        setLoadingUserData(false);
      }
    };

    fetchUserData();
  }, [user, firestore]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth]);

  // Procesar datos del usuario desde Firestore
  const userData = useMemo(() => {
    // Solo procesar si hay usuario autenticado y los datos están disponibles
    if (!user || loadingUserData) {
      return null;
    }
    
    // Si no hay datos, retornar null
    if (!userDataFromFirestore) {
      return null;
    }
    
    // Convertir los datos de Firestore al tipo TUser
    const data = userDataFromFirestore;
    return {
      id: data.id || user.uid,
      email: data.email || user.email || '',
      displayName: data.displayName || user.displayName || '',
      photoURL: data.photoURL || user.photoURL || undefined,
      role: data.role || EUserRole.BANDERAS,
      status: data.status || 'active',
      createdAt: data.createdAt?.toDate?.() || new Date(),
      lastLogin: data.lastLogin?.toDate?.() || undefined,
      permissions: Array.isArray(data.permissions) ? data.permissions : [],
      phone: typeof data.phone === "string" ? data.phone : undefined,
    } as TUser;
  }, [user, userDataFromFirestore, loadingUserData]);

  const userRole = useMemo(() => {
    return userData?.role || null;
  }, [userData]);

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      throw error;
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      throw error;
    }
  };

  // Memorizar el valor del contexto para evitar re-renders innecesarios
  const value = useMemo(
    () => ({ 
      user, 
      loading, 
      userData, 
      userRole, 
      loadingUserData,
      signIn, 
      signUp, 
      logout 
    }),
    [user, loading, userData, userRole, loadingUserData]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Wrapper que no requiere Firestore (para usar antes de FirestoreProvider)
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// Provider completo que usa ReactFire (debe estar dentro de FirestoreProvider)
export function AuthProviderWithFirestore({ children }: { children: React.ReactNode }) {
  return <AuthProviderInner>{children}</AuthProviderInner>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 