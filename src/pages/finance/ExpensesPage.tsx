/** /expenses — журнал расходов: реестр как в Excel, с добавлением строк. */
import ExpenseRegister from "@/pages/finance/ExpenseRegister";

export default function ExpensesPage() {
  return <ExpenseRegister title="Расходы" allowEdit />;
}
