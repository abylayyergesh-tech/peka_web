/** Drawer «Права участника»: эффективные права + индивидуальные grant/deny.
 * Требует role.manage (открывается только при наличии этого права). */
import { App, Drawer, Spin, Switch, Tag, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  clearOverride,
  listCapabilities,
  memberCapabilities,
  setOverride,
  type MemberCapabilitiesOut,
  type MemberOut,
  type OverrideEffect,
} from "@/api/admin";
import { errorMessage } from "@/api/client";
import { capLabel, groupByPrefix, groupTitle, roleLabel } from "@/pages/admin/labels";

interface Props {
  member: MemberOut | null;
  open: boolean;
  onClose: () => void;
}

export default function MemberCapabilitiesDrawer({ member, open, onClose }: Props) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const membershipId = member?.id;

  const capsQuery = useQuery({
    queryKey: ["capabilities"],
    queryFn: listCapabilities,
    staleTime: 60_000,
    enabled: open,
  });

  const memberCapsQuery = useQuery({
    queryKey: ["member-capabilities", membershipId],
    queryFn: () => memberCapabilities(membershipId as number),
    enabled: open && membershipId != null,
  });

  function applyResult(data: MemberCapabilitiesOut) {
    queryClient.setQueryData(["member-capabilities", membershipId], data);
  }

  const setMut = useMutation({
    mutationFn: (v: { capability: string; effect: OverrideEffect }) =>
      setOverride(membershipId as number, v.capability, v.effect),
    onSuccess: (data) => {
      applyResult(data);
      message.success("Право обновлено");
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const clearMut = useMutation({
    mutationFn: (capability: string) => clearOverride(membershipId as number, capability),
    onSuccess: (data) => {
      applyResult(data);
      message.success("Настройка сброшена, действует роль");
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const caps = memberCapsQuery.data;
  const effective = new Set(caps?.effective ?? []);
  const grants = new Set(caps?.grants ?? []);
  const denies = new Set(caps?.denies ?? []);
  const groups = groupByPrefix(capsQuery.data ?? []);
  const loading = capsQuery.isPending || memberCapsQuery.isPending;
  const busy = setMut.isPending || clearMut.isPending;

  return (
    <Drawer
      title="Права участника"
      open={open}
      onClose={onClose}
      width={520}
      destroyOnClose
    >
      {member && (
        <div style={{ marginBottom: 16 }}>
          <Typography.Text strong>{member.full_name || member.email || "—"}</Typography.Text>
          <div>
            <Typography.Text type="secondary">
              {member.email || "—"} · роль: {roleLabel(member.role)}
            </Typography.Text>
          </div>
        </div>
      )}
      {loading ? (
        <Spin />
      ) : (
        groups.map(([prefix, groupCaps]) => (
          <div key={prefix} style={{ marginBottom: 16 }}>
            <Typography.Text strong>{groupTitle(prefix)}</Typography.Text>
            {groupCaps.map((cap) => {
              const overridden = grants.has(cap.key) || denies.has(cap.key);
              const pending =
                (setMut.isPending && setMut.variables?.capability === cap.key) ||
                (clearMut.isPending && clearMut.variables === cap.key);
              return (
                <div
                  key={cap.key}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}
                >
                  <Switch
                    size="small"
                    checked={effective.has(cap.key)}
                    loading={pending}
                    disabled={busy && !pending}
                    onChange={(checked) =>
                      setMut.mutate({ capability: cap.key, effect: checked ? "grant" : "deny" })
                    }
                  />
                  <span style={{ flex: 1 }}>{capLabel(cap)}</span>
                  {grants.has(cap.key) && <Tag color="green">разрешено лично</Tag>}
                  {denies.has(cap.key) && <Tag color="red">запрещено лично</Tag>}
                  {!overridden && <Tag>по роли</Tag>}
                  {overridden && (
                    <a onClick={() => !busy && clearMut.mutate(cap.key)}>сбросить</a>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </Drawer>
  );
}
