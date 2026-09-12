/** Карточка сущности: клик по строке открывает просмотр, правка — справа сверху.
 *
 * Список отвечает на «что есть». Карточка — на «что это». Редактирование
 * начинается кнопкой в шапке, а не ссылкой в последней колонке: туда мышью
 * не целиться, и на узком экране колонку «Действия» съедает горизонтальный скролл.
 */
import { EditOutlined } from "@ant-design/icons";
import { Button, Drawer, Space } from "antd";
import type { ReactNode } from "react";

export default function EntityCardDrawer({
  open,
  onClose,
  title,
  width = 480,
  canEdit,
  editing,
  onStartEdit,
  onCancelEdit,
  onSave,
  savePending,
  extra,
  view,
  form,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  width?: number;
  canEdit?: boolean;
  editing: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSave?: () => void;
  savePending?: boolean;
  /** Доп. действия в шапке (деактивировать, удалить) — только в просмотре. */
  extra?: ReactNode;
  view: ReactNode;
  form: ReactNode;
}) {
  return (
    <Drawer
      open={open}
      onClose={editing ? onCancelEdit ?? onClose : onClose}
      width={width}
      title={title}
      destroyOnClose
      extra={
        <Space>
          {!editing && extra}
          {canEdit && !editing && onStartEdit && (
            <Button type="primary" icon={<EditOutlined />} onClick={onStartEdit}>
              Редактировать
            </Button>
          )}
          {editing && (
            <>
              <Button onClick={onCancelEdit ?? onClose}>Отмена</Button>
              <Button type="primary" loading={savePending} onClick={onSave}>
                Сохранить
              </Button>
            </>
          )}
        </Space>
      }
    >
      {editing ? form : view}
    </Drawer>
  );
}
