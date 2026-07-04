/** Session state: token + active org persisted; profile/caps fetched per load. */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface OrganizationOut {
  id: number;
  name: string;
}

export interface Me {
  id: number;
  email: string;
  full_name: string;
  organizations: OrganizationOut[];
}

interface AuthState {
  token: string | null;
  activeOrgId: number | null;
  /** Profile — null until /auth/me resolves after login/reload. */
  me: Me | null;
  /** Effective capabilities in the active org — [] until /me/capabilities resolves. */
  caps: string[];
  capsLoaded: boolean;
  setToken: (token: string) => void;
  setActiveOrg: (orgId: number) => void;
  setMe: (me: Me) => void;
  setCaps: (caps: string[]) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      activeOrgId: null,
      me: null,
      caps: [],
      capsLoaded: false,
      setToken: (token) => set({ token }),
      setActiveOrg: (orgId) => set({ activeOrgId: orgId, caps: [], capsLoaded: false }),
      setMe: (me) => set({ me }),
      setCaps: (caps) => set({ caps, capsLoaded: true }),
      logout: () =>
        set({ token: null, activeOrgId: null, me: null, caps: [], capsLoaded: false }),
    }),
    {
      name: "peka-rsm-auth",
      partialize: (s) => ({ token: s.token, activeOrgId: s.activeOrgId }),
    },
  ),
);

/** True if the current member has the capability (e.g. "inventory.manage"). */
export function useCan(cap: string): boolean {
  return useAuthStore((s) => s.caps.includes(cap));
}
