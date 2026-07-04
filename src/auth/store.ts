/** Session state: token pair + active org persisted; profile/caps fetched per load. */
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
  refreshToken: string | null;
  activeOrgId: number | null;
  /** Profile — null until /auth/me resolves after login/reload. */
  me: Me | null;
  /** Effective capabilities in the active org — [] until /me/capabilities resolves. */
  caps: string[];
  capsLoaded: boolean;
  setTokens: (access: string, refresh: string | null) => void;
  setActiveOrg: (orgId: number) => void;
  setMe: (me: Me) => void;
  setCaps: (caps: string[]) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      activeOrgId: null,
      me: null,
      caps: [],
      capsLoaded: false,
      setTokens: (access, refresh) => set({ token: access, refreshToken: refresh }),
      setActiveOrg: (orgId) => set({ activeOrgId: orgId, caps: [], capsLoaded: false }),
      setMe: (me) => set({ me }),
      setCaps: (caps) => set({ caps, capsLoaded: true }),
      logout: () =>
        set({
          token: null,
          refreshToken: null,
          activeOrgId: null,
          me: null,
          caps: [],
          capsLoaded: false,
        }),
    }),
    {
      name: "peka-rsm-auth",
      partialize: (s) => ({
        token: s.token,
        refreshToken: s.refreshToken,
        activeOrgId: s.activeOrgId,
      }),
    },
  ),
);

/** True if the current member has the capability (e.g. "inventory.manage"). */
export function useCan(cap: string): boolean {
  return useAuthStore((s) => s.caps.includes(cap));
}
