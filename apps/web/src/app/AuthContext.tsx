import { authApi, getFirebaseClients, hasFirebaseConfig } from "@pocket/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface PocketUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isLocal: boolean;
}

interface AuthContextValue {
  user: PocketUser | null;
  loading: boolean;
  firebaseEnabled: boolean;
  continueLocal: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const LOCAL_KEY = "pocket-local-session";

function mapUser(user: User): PocketUser {
  return { uid: user.uid, email: user.email, displayName: user.displayName, isLocal: false };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const firebaseEnabled = hasFirebaseConfig();
  const [user, setUser] = useState<PocketUser | null>(() => {
    if (firebaseEnabled) return null;
    return sessionStorage.getItem(LOCAL_KEY)
      ? { uid: "local-owner", email: "local@pocket.app", displayName: "Chủ shop", isLocal: true }
      : null;
  });
  const [loading, setLoading] = useState(firebaseEnabled);

  useEffect(() => {
    const clients = getFirebaseClients();
    if (!clients) {
      setLoading(false);
      return;
    }
    return onAuthStateChanged(clients.auth, (nextUser) => {
      setUser(nextUser ? mapUser(nextUser) : null);
      setLoading(false);
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      firebaseEnabled,
      continueLocal: () => {
        sessionStorage.setItem(LOCAL_KEY, "1");
        setUser({
          uid: "local-owner",
          email: "local@pocket.app",
          displayName: "Chủ shop",
          isLocal: true,
        });
      },
      signOut: async () => {
        sessionStorage.removeItem(LOCAL_KEY);
        await authApi.signOut();
        setUser(null);
      },
    }),
    [user, loading, firebaseEnabled],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
