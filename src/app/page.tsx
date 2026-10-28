import PlanForm from "./plan-form";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Encore</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Reminiscence sessions for people living with dementia, grounded in what their generation and
          region actually loved.
        </p>
      </header>
      <PlanForm />
    </main>
  );
}
