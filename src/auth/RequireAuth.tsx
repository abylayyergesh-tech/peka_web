/** Route guard: token present -> bootstrap profile + caps, else -> /login.
 *
 * Bootstraps in two steps on every full page load:
 *   1. GET /auth/me       -> profile + my organizations (picks/validates active org)
 *   2. GET /me/capabilities -> capability set for the active org (menu gating)
 */
import { Result, Spin } from "antd";
import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { fetchMe, fetchMyCapabilities } from "@/api/auth";
import { errorMessage } from "@/api/client";
import { useAuthStore } from "@/auth/store";
import { useQuery } from "@tanstack/react-query";

export default function RequireAuth() {
  const location = useLocation();
  const { token, activeOrgId, me, setMe, setActiveOrg, setCaps } = useAuthStore();

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchMe,
    enabled: !!token,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!meQuery.data) return;
    setMe(meQuery.data);
    const orgs = meQuery.data.organizations;
    // Active org missing or no longer a membership -> fall back to the first org.
    if (orgs.length > 0 && !orgs.some((o) => o.id === activeOrgId)) {
      setActiveOrg(orgs[0].id);
    }
  }, [meQuery.data, activeOrgId, setMe, setActiveOrg]);

  const capsQuery = useQuery({
    queryKey: ["auth", "caps", activeOrgId],
    queryFn: fetchMyCapabilities,
    enabled: !!token && activeOrgId != null,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (capsQuery.data) setCaps(capsQuery.data.effective);
  }, [capsQuery.data, setCaps]);

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (meQuery.isError) {
    return <Result status="error" title="Не удалось загрузить профиль" subTitle={errorMessage(meQuery.error)} />;
  }
  if (!me || (activeOrgId != null && !useAuthStore.getState().capsLoaded && capsQuery.isPending)) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spin size="large" />
      </div>
    );
  }
  return <Outlet />;
}
