/** Ловушка ошибок отрисовки: вместо белого экрана — понятный экран.
 *
 * React при ошибке в render размонтирует всё дерево, и без границы пользователь
 * видит пустую страницу без единого слова. Особенно неприятно это на рабочем
 * месте: человек не знает, потерялись ли его данные и что делать дальше.
 *
 * Границы две, и обе нужны:
 *   * вокруг `<Outlet/>` в layout — сломанная страница не уносит с собой меню,
 *     и переход в другой раздел возвращает приложение в рабочее состояние;
 *   * вокруг всего приложения в `main.tsx` — на случай, когда ломается то, что
 *     выше layout (провайдеры, маршрутизатор).
 */
import { Button, Result, Typography } from "antd";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Что предложить кроме перезагрузки: обычно ссылка на главную. */
  homePath?: string;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // В консоль — единственное место, где текст ошибки доступен поддержке:
    // сборщика ошибок в проекте пока нет.
    console.error("Необработанная ошибка отрисовки:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { homePath = "/" } = this.props;
    return (
      <Result
        status="error"
        title="Страница не открылась"
        subTitle={
          <span>
            Сломалось отображение, а не данные: всё, что было сохранено, на
            месте. Обновите страницу — если повторится, покажите этот текст
            разработчику.
          </span>
        }
        extra={[
          <Button key="reload" type="primary" onClick={() => window.location.reload()}>
            Обновить страницу
          </Button>,
          <Button key="home" onClick={() => { window.location.href = homePath; }}>
            На главную
          </Button>,
        ]}
      >
        <Typography.Paragraph
          copyable={{ text: `${error.message}\n${error.stack ?? ""}` }}
          style={{ marginBottom: 0 }}
        >
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {error.message}
          </Typography.Text>
        </Typography.Paragraph>
      </Result>
    );
  }
}
