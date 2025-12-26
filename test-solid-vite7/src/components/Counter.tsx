import { createSignal, createEffect, createMemo, onCleanup, batch } from 'solid-js';

// Test: Basic signals, effects, memos, cleanup, batch
export function Counter() {
  const [count, setCount] = createSignal(0);
  const [step, setStep] = createSignal(1);

  // Derived signal with memo
  const doubled = createMemo(() => count() * 2);
  const tripled = createMemo(() => count() * 3);
  const isEven = createMemo(() => count() % 2 === 0);

  // Effect with cleanup
  createEffect(() => {
    const currentCount = count();
    console.log('Count changed to:', currentCount);

    const timer = setInterval(() => {
      console.log('Timer tick for count:', currentCount);
    }, 5000);

    onCleanup(() => {
      console.log('Cleaning up timer for count:', currentCount);
      clearInterval(timer);
    });
  });

  // Effect that depends on multiple signals
  createEffect(() => {
    console.log(`Count: ${count()}, Step: ${step()}, Doubled: ${doubled()}`);
  });

  const increment = () => setCount((c) => c + step());
  const decrement = () => setCount((c) => c - step());

  const batchUpdate = () => {
    batch(() => {
      setCount((c) => c + 10);
      setStep((s) => s + 1);
    });
  };

  const reset = () => {
    batch(() => {
      setCount(0);
      setStep(1);
    });
  };

  return (
    <div class="counter-container">
      <h2>Counter Component</h2>

      <div class="counter-display">
        <span class="count-value">{count()}</span>
        <span class="count-info">
          (doubled: {doubled()}, tripled: {tripled()})
        </span>
      </div>

      <div class="counter-status" classList={{ even: isEven(), odd: !isEven() }}>
        {isEven() ? 'Even number' : 'Odd number'}
      </div>

      <div class="counter-controls">
        <button onClick={decrement}>- {step()}</button>
        <button onClick={increment}>+ {step()}</button>
      </div>

      <div class="step-control">
        <label>
          Step size:
          <input
            type="number"
            value={step()}
            onInput={(e) => setStep(parseInt(e.currentTarget.value) || 1)}
            min="1"
            max="10"
          />
        </label>
      </div>

      <div class="counter-actions">
        <button onClick={batchUpdate}>Batch Update (+10, step+1)</button>
        <button onClick={reset}>Reset</button>
      </div>
    </div>
  );
}
