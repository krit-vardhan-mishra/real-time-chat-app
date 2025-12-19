import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  storeKeys,
  generateKeyPair,
  getKeys,
  uploadKeyBundle,
  recoverKeysFromServer,
  hasServerKeyBundle
} from "@/lib/crypto";
import RecoveryPinDialog from "@/components/recovery-pin-dialog";

interface User {
  id: number;
  username: string;
  fullName?: string | null;
  email?: string | null;
  avatar?: string | null;
  gender?: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, fullName?: string, email?: string, avatar?: string, gender?: string) => Promise<void>;
  logout: () => Promise<void>;
}

type PinDialogState =
  | { show: false }
  | { show: true; mode: "create" | "recover"; isLoading: boolean; error: string | null };

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [pinDialog, setPinDialog] = useState<PinDialogState>({ show: false });
  const [pendingAuth, setPendingAuth] = useState<"login" | "register" | null>(null);

  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/user"],
    retry: false,
  });

  // Handle PIN submission for key recovery/creation
  const handlePinSubmit = async (pin: string) => {
    if (!pinDialog.show) return;

    setPinDialog({ ...pinDialog, isLoading: true, error: null });

    try {
      if (pinDialog.mode === "create") {
        // Create key bundle and upload to server
        await uploadKeyBundle(pin);
        console.log("✅ Key bundle created and uploaded");
      } else {
        // Recover keys from server
        const recovered = await recoverKeysFromServer(pin);
        if (!recovered) {
          throw new Error("No key bundle found on server");
        }
        console.log("✅ Keys recovered from server");
      }

      // Close dialog and refresh user data
      setPinDialog({ show: false });
      setPendingAuth(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to process PIN";
      setPinDialog({ ...pinDialog, isLoading: false, error: message });
    }
  };

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }

      return res.json();
    },
    onSuccess: async () => {
      console.log("🔐 Login successful - checking key status...");

      // Wait for session to be established
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if we have local keys
      const localKeys = getKeys();

      if (localKeys) {
        // We have local keys - upload to ensure server is in sync
        console.log("✅ Found local keys, syncing with server...");
        try {
          const res = await fetch("/api/user/public-key", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ publicKey: localKeys.publicKey }),
            credentials: "include",
          });
          if (res.ok) {
            console.log("✅ Public key synced with server");
          }
        } catch (e) {
          console.warn("Failed to sync public key:", e);
        }

        await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
        await queryClient.refetchQueries({ queryKey: ["/api/user"] });
      } else {
        // No local keys - check if server has key bundle
        console.log("🔑 No local keys found, checking server for key bundle...");
        const hasBundle = await hasServerKeyBundle();

        if (hasBundle) {
          // Server has keys - show recovery PIN dialog
          console.log("🔐 Server has key bundle, requesting recovery PIN...");
          setPendingAuth("login");
          setPinDialog({ show: true, mode: "recover", isLoading: false, error: null });
        } else {
          // No keys anywhere - generate new and prompt for PIN
          console.log("🔑 No keys found anywhere, generating new keys...");
          const newKeys = generateKeyPair();
          storeKeys(newKeys.publicKey, newKeys.secretKey);

          // Upload public key immediately
          try {
            await fetch("/api/user/public-key", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ publicKey: newKeys.publicKey }),
              credentials: "include",
            });
          } catch (e) {
            console.warn("Failed to upload public key:", e);
          }

          // Show PIN creation dialog
          console.log("🔐 Requesting PIN to secure keys...");
          setPendingAuth("login");
          setPinDialog({ show: true, mode: "create", isLoading: false, error: null });
        }
      }
    },
  });

  const registerMutation = useMutation({
    mutationFn: async ({ username, password, fullName, email, avatar, gender }: { username: string; password: string; fullName?: string; email?: string; avatar?: string; gender?: string }) => {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, fullName, email, avatar, gender }),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }

      return res.json();
    },
    onSuccess: async () => {
      console.log("🔐 Registration successful - generating keys...");

      // Wait for session to be established
      await new Promise(resolve => setTimeout(resolve, 100));

      // Generate new encryption keys
      const clientKeys = generateKeyPair();
      storeKeys(clientKeys.publicKey, clientKeys.secretKey);
      console.log("✅ Keys generated and stored");

      // Upload public key immediately
      try {
        await fetch("/api/user/public-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicKey: clientKeys.publicKey }),
          credentials: "include",
        });
        console.log("✅ Public key uploaded");
      } catch (e) {
        console.warn("Failed to upload public key:", e);
      }

      // Show PIN creation dialog
      console.log("🔐 Requesting PIN to secure keys...");
      setPendingAuth("register");
      setPinDialog({ show: true, mode: "create", isLoading: false, error: null });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Logout failed");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(["/api/user"], null);
    },
  });

  const login = async (username: string, password: string) => {
    await loginMutation.mutateAsync({ username, password });
  };

  const register = async (username: string, password: string, fullName?: string, email?: string, avatar?: string, gender?: string) => {
    await registerMutation.mutateAsync({ username, password, fullName, email, avatar, gender });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  return (
    <AuthContext.Provider value={{ user: user || null, isLoading, login, register, logout }}>
      {children}

      {/* Recovery PIN Dialog */}
      {pinDialog.show && (
        <RecoveryPinDialog
          mode={pinDialog.mode}
          onSubmit={handlePinSubmit}
          isLoading={pinDialog.isLoading}
          error={pinDialog.error}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    console.warn("useAuth called outside AuthProvider — returning fallback (isLoading: true)");
    return {
      user: null,
      isLoading: true,
      login: async () => { throw new Error("AuthProvider not ready"); },
      register: async () => { throw new Error("AuthProvider not ready"); },
      logout: async () => { throw new Error("AuthProvider not ready"); },
    } as AuthContextType;
  }
  return context;
}
