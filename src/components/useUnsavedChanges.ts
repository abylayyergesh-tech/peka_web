/** Предупреждение о несохранённом.
 *
 * Табель, инвентаризация и план выпуска держат правки в состоянии страницы до
 * кнопки «Сохранить»: заполненный день пропадал молча — закрыл вкладку или ушёл
 * в другой раздел, и работы нет. Хук закрывает оба выхода:
 *
 *   * `beforeunload` — закрытие вкладки и перезагрузка (браузер показывает своё
 *     стандартное окно, свой текст туда подставить нельзя);
 *   * `useBlocker` — переход внутри приложения, здесь окно уже наше.
 *
 * `useBlocker` требует data-роутера (`createBrowserRouter`) — он и используется.
 */
import { App } from "antd";
import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

export function useUnsavedChanges(
  dirty: boolean,
  what = "Несохранённые изменения потеряются.",
): void {
  const { modal } = App.useApp();

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // Обе строки намеренно: разные браузеры смотрят на разное.
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    modal.confirm({
      title: "Уйти со страницы?",
      content: what,
      okText: "Уйти без сохранения",
      okButtonProps: { danger: true },
      cancelText: "Остаться",
      onOk: () => blocker.proceed(),
      onCancel: () => blocker.reset(),
    });
  }, [blocker, modal, what]);
}
