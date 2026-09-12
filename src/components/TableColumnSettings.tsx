/** Панель «какие колонки показать» — открывается с таблицы, а не из отдельного раздела. */
import { SettingOutlined } from "@ant-design/icons";
import { Button, Checkbox, Divider, Popover, Space } from "antd";

import type { TableColumnSettingsState } from "@/components/useTableColumnSettings";

export default function TableColumnSettings({
  settings,
}: {
  settings: TableColumnSettingsState;
}) {
  const unlocked = settings.specs.filter((s) => !s.locked);
  const locked = settings.specs.filter((s) => s.locked);
  const checked = unlocked.filter((s) => settings.isVisible(s.key)).map((s) => s.key);
  const allOn = checked.length === unlocked.length;
  const someOn = checked.length > 0 && !allOn;

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      title="Колонки таблицы"
      content={
        <div style={{ width: 240 }}>
          {locked.length > 0 && (
            <Space direction="vertical" size={4} style={{ marginBottom: 8 }}>
              {locked.map((s) => (
                <Checkbox key={s.key} checked disabled>
                  {s.label}
                </Checkbox>
              ))}
            </Space>
          )}
          <Checkbox
            indeterminate={someOn}
            checked={allOn}
            onChange={(e) =>
              settings.setVisibleKeys(e.target.checked ? unlocked.map((s) => s.key) : [])
            }
          >
            Все колонки
          </Checkbox>
          <Divider style={{ margin: "8px 0" }} />
          <Checkbox.Group
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
            value={checked}
            onChange={(keys) => settings.setVisibleKeys(keys.map(String))}
            options={unlocked.map((s) => ({ value: s.key, label: s.label }))}
          />
          <Divider style={{ margin: "8px 0" }} />
          <Button type="link" size="small" style={{ padding: 0 }} onClick={settings.reset}>
            Как было
          </Button>
        </div>
      }
    >
      <Button icon={<SettingOutlined />}>Колонки</Button>
    </Popover>
  );
}
