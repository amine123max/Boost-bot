export type TestState = "pending" | "running" | "success" | "failed";
export interface AccountTest {
  accountId: string;
  state: TestState;
  message: string;
  testedAt: number | null;
}
export async function runAccountTests<T>(
  items: T[],
  run: (item: T) => Promise<void>,
  concurrency = 3,
) {
  let index = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      async () => {
        while (index < items.length) {
          const item = items[index++];
          await run(item);
        }
      },
    ),
  );
}
