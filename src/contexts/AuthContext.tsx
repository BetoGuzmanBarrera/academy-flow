import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/database.types';

interface SignUpProfile {
  firstName: string;
  lastName: string;
  birthDate?: string;
}

interface AuthResult {
  error: Error | null;
}

interface AuthOptions {
  captchaToken?: string;
}

interface SignUpResult extends AuthResult {
  user: User | null;
  session: Session | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string, options?: AuthOptions) => Promise<AuthResult>;
  signUp: (email: string, password: string, profile: SignUpProfile, options?: AuthOptions) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId?: string) => {
    const id = userId ?? user?.id;

    if (!id) {
      setProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('No se pudo cargar el perfil:', error.message);
      setProfile(null);
      return;
    }

    setProfile(data);
  };

  const refreshProfile = async () => {
    await loadProfile();
  };

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      const { data: { session: initialSession } } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(initialSession);
      setUser(initialSession?.user ?? null);

      if (initialSession?.user) {
        await loadProfile(initialSession.user.id);
      }

      if (mounted) setLoading(false);
    };

    void initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        void loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (
    email: string,
    password: string,
    options?: AuthOptions,
  ): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: options?.captchaToken
        ? { captchaToken: options.captchaToken }
        : undefined,
    });
    return { error };
  };

  const signUp = async (
    email: string,
    password: string,
    profileData: SignUpProfile,
    options?: AuthOptions,
  ): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          first_name: profileData.firstName.trim(),
          last_name: profileData.lastName.trim(),
          birth_date: profileData.birthDate || null,
        },
        ...(options?.captchaToken ? { captchaToken: options.captchaToken } : {}),
      },
    });

    return { user: data.user, session: data.session, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isAdmin: profile?.role === 'admin',
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
