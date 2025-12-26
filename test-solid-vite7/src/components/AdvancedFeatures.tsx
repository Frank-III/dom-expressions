import {
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  Show,
  For,
  Index,
  untrack,
  type Accessor,
} from 'solid-js';
import { Portal } from 'solid-js/web';

// Custom directive type
declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      clickOutside: () => void;
      tooltip: string;
      autofocus: boolean;
    }
  }
}

// Custom directive: click outside
export function clickOutside(el: HTMLElement, accessor: Accessor<() => void>) {
  const onClick = (e: MouseEvent) => {
    if (!el.contains(e.target as Node)) {
      accessor()?.();
    }
  };
  document.body.addEventListener('click', onClick);
  onCleanup(() => document.body.removeEventListener('click', onClick));
}

// Custom directive: tooltip
export function tooltip(el: HTMLElement, accessor: Accessor<string>) {
  el.title = accessor();
  createEffect(() => {
    el.title = accessor();
  });
}

// Custom directive: autofocus
export function autofocus(el: HTMLElement, accessor: Accessor<boolean>) {
  if (accessor()) {
    onMount(() => el.focus());
  }
}

// Test: Refs, directives, Portal, Index, untrack, spread props
export function AdvancedFeatures() {
  const [showModal, setShowModal] = createSignal(false);
  const [inputValue, setInputValue] = createSignal('');
  const [items, setItems] = createSignal(['Apple', 'Banana', 'Cherry']);
  const [selectedIndex, setSelectedIndex] = createSignal(-1);
  const [styleObj, setStyleObj] = createSignal({ color: 'blue', fontSize: '16px' });

  // Multiple refs
  let containerRef: HTMLDivElement | undefined;
  let inputRef: HTMLInputElement | undefined;
  let buttonRefs: HTMLButtonElement[] = [];

  // Ref callback pattern
  const setButtonRef = (index: number) => (el: HTMLButtonElement) => {
    buttonRefs[index] = el;
  };

  // Using untrack
  const logWithoutTracking = () => {
    const currentValue = untrack(() => inputValue());
    console.log('Input value (untracked):', currentValue);
  };

  // Dynamic style object
  const toggleStyle = () => {
    setStyleObj((prev) => ({
      color: prev.color === 'blue' ? 'red' : 'blue',
      fontSize: prev.fontSize === '16px' ? '20px' : '16px',
    }));
  };

  // Spread props test
  const buttonProps = {
    class: 'spread-button',
    'data-testid': 'spread-test',
    disabled: false,
  };

  const dynamicProps = () => ({
    style: styleObj(),
    'aria-label': `Current value: ${inputValue()}`,
  });

  onMount(() => {
    console.log('AdvancedFeatures mounted');
    console.log('Container ref:', containerRef);
    console.log('Input ref:', inputRef);
  });

  return (
    <div ref={containerRef} class="advanced-features">
      <h2>Advanced Features</h2>

      {/* Refs and input */}
      <section class="section">
        <h3>Refs & Input</h3>
        <input
          ref={inputRef}
          type="text"
          value={inputValue()}
          onInput={(e) => setInputValue(e.currentTarget.value)}
          placeholder="Type something..."
          use:autofocus={true}
        />
        <button onClick={() => inputRef?.focus()}>Focus Input</button>
        <button onClick={logWithoutTracking}>Log (untracked)</button>
      </section>

      {/* Dynamic styles */}
      <section class="section">
        <h3>Dynamic Styles</h3>
        <div style={styleObj()}>
          This text has dynamic styles
        </div>
        <div style={{ 'background-color': 'lightgray', padding: '10px' }}>
          Static style object
        </div>
        <button onClick={toggleStyle}>Toggle Style</button>
      </section>

      {/* Spread props */}
      <section class="section">
        <h3>Spread Props</h3>
        <button {...buttonProps} onClick={() => console.log('Spread button clicked')}>
          Button with spread props
        </button>
        <div {...dynamicProps()}>
          Div with dynamic spread props
        </div>
      </section>

      {/* Index vs For comparison */}
      <section class="section">
        <h3>Index vs For</h3>
        <div class="comparison">
          <div>
            <h4>Using For:</h4>
            <For each={items()}>
              {(item, index) => (
                <div
                  classList={{ selected: selectedIndex() === index() }}
                  onClick={() => setSelectedIndex(index())}
                >
                  {index()}: {item}
                </div>
              )}
            </For>
          </div>
          <div>
            <h4>Using Index:</h4>
            <Index each={items()}>
              {(item, index) => (
                <div
                  classList={{ selected: selectedIndex() === index }}
                  onClick={() => setSelectedIndex(index)}
                >
                  {index}: {item()}
                </div>
              )}
            </Index>
          </div>
        </div>
        <button onClick={() => setItems((i) => [...i, `Item ${i.length + 1}`])}>
          Add Item
        </button>
      </section>

      {/* Button refs array */}
      <section class="section">
        <h3>Multiple Refs</h3>
        <For each={[0, 1, 2]}>
          {(i) => (
            <button
              ref={setButtonRef(i)}
              onClick={() => console.log(`Button ${i} clicked, ref:`, buttonRefs[i])}
            >
              Button {i}
            </button>
          )}
        </For>
      </section>

      {/* Portal for modal */}
      <section class="section">
        <h3>Portal (Modal)</h3>
        <button onClick={() => setShowModal(true)}>Open Modal</button>

        <Show when={showModal()}>
          <Portal>
            <div class="modal-overlay" onClick={() => setShowModal(false)}>
              <div
                class="modal-content"
                onClick={(e) => e.stopPropagation()}
                use:clickOutside={() => setShowModal(false)}
              >
                <h4>Modal Title</h4>
                <p>This is rendered via Portal outside the component tree.</p>
                <p>Current input value: {inputValue()}</p>
                <button onClick={() => setShowModal(false)}>Close</button>
              </div>
            </div>
          </Portal>
        </Show>
      </section>

      {/* Tooltip directive */}
      <section class="section">
        <h3>Tooltip Directive</h3>
        <button use:tooltip={`Input has ${inputValue().length} characters`}>
          Hover for tooltip
        </button>
      </section>

      {/* prop: and attr: prefixes */}
      <section class="section">
        <h3>prop: and attr: Prefixes</h3>
        <input
          type="text"
          prop:value={inputValue()}
          onInput={(e) => setInputValue(e.currentTarget.value)}
          placeholder="Using prop:value"
        />
        <div attr:data-custom={inputValue()}>
          This div has attr:data-custom
        </div>
      </section>
    </div>
  );
}
