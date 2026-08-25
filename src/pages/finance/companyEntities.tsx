/** Общее для экранов наших юр. лиц: справочник и подпись юрлица в строке.
 *
 *  Отдельным файлом, потому что название юрлица показывают четыре экрана —
 *  кредиторка, дебиторка, клиенты и сама сводка, — и подпись должна быть одна.
 *  Особенно это касается строки «Без юр. лица»: она не декорация, а состояние
 *  данных (запись заведена до разделения или клиента ни к кому не отнесли), и
 *  называть её на разных экранах по-разному значит прятать одно и то же. */
import { Tag, Tooltip } from "antd";
import { useQuery } from "@tanstack/react-query";

import { listCompanyEntities, type CompanyEntityOut } from "@/api/companies";

/** Ключ запроса справочника — один на приложение, чтобы правка доезжала везде. */
export const COMPANY_ENTITIES_KEY = ["company-entities"];

/** Подпись для записей без юрлица. Одна на все экраны. */
export const NO_ENTITY_LABEL = "Без юр. лица";

/** Значение фильтра «без юр. лица». Ровно то, что понимает сервер. */
export const NO_ENTITY_FILTER = "none";

export function useCompanyEntities(includeInactive = false) {
  return useQuery({
    queryKey: [...COMPANY_ENTITIES_KEY, { includeInactive }],
    queryFn: () => listCompanyEntities(includeInactive),
    // Реквизиты меняются раз в год; лишний запрос на каждом экране не нужен.
    staleTime: 300_000,
  });
}

/** Название юрлица по id. Неизвестный id показываем как «#id», а не пустым: так
 *  видно, что ссылка есть, но справочник её не знает (закрытая компания). */
export function entityName(
  entities: CompanyEntityOut[] | undefined,
  id: number | null | undefined,
): string {
  if (id == null) return NO_ENTITY_LABEL;
  const found = entities?.find((e) => e.company_entity_id === id);
  return found ? found.name : `#${id}`;
}

export function EntityTag({
  entities,
  id,
}: {
  entities: CompanyEntityOut[] | undefined;
  id: number | null | undefined;
}) {
  if (id == null) {
    return (
      <Tooltip title="Запись заведена до разделения на юр. лица либо клиент ни к кому не отнесён">
        <Tag style={{ marginInlineEnd: 0 }}>{NO_ENTITY_LABEL}</Tag>
      </Tooltip>
    );
  }
  const found = entities?.find((e) => e.company_entity_id === id);
  return (
    <Tooltip title={found ? `БИН ${found.tax_id}` : undefined}>
      <Tag color="blue" style={{ marginInlineEnd: 0 }}>
        {found ? found.name : `#${id}`}
      </Tag>
    </Tooltip>
  );
}

/** Варианты для фильтра «юр. лицо» — с пунктом «без юр. лица». */
export function entityFilterOptions(entities: CompanyEntityOut[] | undefined) {
  return [
    ...(entities ?? []).map((e) => ({
      value: String(e.company_entity_id),
      label: e.name,
    })),
    { value: NO_ENTITY_FILTER, label: NO_ENTITY_LABEL },
  ];
}
