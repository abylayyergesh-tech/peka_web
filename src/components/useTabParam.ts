/** Активная вкладка живёт в адресной строке (?tab=…).
 *
 * Вкладки несут самостоятельные экраны (остатки склада, чеки смены): на них
 * ссылаются, их перезагружают и на них возвращаются кнопкой «назад». Вкладка по
 * умолчанию из URL убирается — адрес остаётся коротким. Переключение идёт с
 * replace: история браузера не должна забиваться кликами по вкладкам.
 */
import { useSearchParams } from "react-router-dom";

export function useTabParam(defaultKey: string, keys?: readonly string[]) {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  // Незнакомый ?tab= (опечатка в ссылке, переименованная вкладка) не должен
  // оставлять пустую страницу.
  const active = raw && (!keys || keys.includes(raw)) ? raw : defaultKey;

  function setActive(key: string) {
    const next = new URLSearchParams(params);
    if (key === defaultKey) next.delete("tab");
    else next.set("tab", key);
    setParams(next, { replace: true });
  }

  return [active, setActive] as const;
}
