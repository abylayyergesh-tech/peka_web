/** /reports/expenses — тот же реестр, без правок: смотреть и выгрузить. */
import ExpenseRegister from "@/pages/finance/ExpenseRegister";

export default function ExpenseRegisterPage() {
  return <ExpenseRegister title="Реестр расходов" allowEdit={false} />;
}
