// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { TagInput } from './TagInput';

// Tells React these renders are inside act(), which silences its warning and
// makes state updates flush before the assertions run.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Mounts the real component with react-dom directly.
 *
 * Testing Library is what cannot load here — it is CJS in the hoisted root and
 * drags in the root's mismatched react-dom (see vitest.config.ts). react-dom
 * resolves to this app's own copy, so the component itself is testable.
 */
function mount(ui: React.ReactElement) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return {
    host,
    input: () => host.querySelector('input') as HTMLInputElement,
    chips: () => Array.from(host.querySelectorAll('span > span')).map((n) => n.textContent),
    removeButton: (tag: string) =>
      host.querySelector(`button[aria-label="Remove ${tag}"]`) as HTMLButtonElement,
  };
}

/** What the browser does when someone types into a controlled React input. */
function typeInto(input: HTMLInputElement, text: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function pressEnter(input: HTMLInputElement) {
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
}

describe('TagInput (rendered)', () => {
  it('shows the tags the lead already has', () => {
    const { chips } = mount(<TagInput value={['typeform', 'preluat']} onChange={() => {}} />);

    expect(chips()).toEqual(['typeform', 'preluat']);
  });

  it('reports the tag when Enter is pressed', () => {
    const onChange = vi.fn();
    const { input } = mount(<TagInput value={[]} onChange={onChange} />);

    typeInto(input(), 'de sunat luni');
    pressEnter(input());

    expect(onChange).toHaveBeenCalledWith(['de sunat luni']);
  });

  it('clears the box after a tag is committed, ready for the next one', () => {
    const { input } = mount(<TagInput value={[]} onChange={() => {}} />);

    typeInto(input(), 'vip');
    pressEnter(input());

    expect(input().value).toBe('');
  });

  // The box sits inside the lead form: Enter must commit the tag, not save the
  // lead with the tag still unsent.
  it('does not submit the surrounding form when Enter commits a tag', () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    const { host, input } = mount(
      <form>
        <TagInput value={[]} onChange={() => {}} />
      </form>,
    );
    host.querySelector('form')!.addEventListener('submit', onSubmit);

    typeInto(input(), 'vip');
    pressEnter(input());

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('ends the tag at a comma, which the stored format cannot contain', () => {
    const onChange = vi.fn();
    const { input } = mount(<TagInput value={[]} onChange={onChange} />);

    typeInto(input(), 'vip,');

    expect(onChange).toHaveBeenCalledWith(['vip']);
  });

  it('reports the shorter list when a tag is removed', () => {
    const onChange = vi.fn();
    const { removeButton } = mount(<TagInput value={['typeform', 'preluat']} onChange={onChange} />);

    act(() => removeButton('preluat').dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(onChange).toHaveBeenCalledWith(['typeform']);
  });

  it('commits a tag left in the box when it loses focus', () => {
    const onChange = vi.fn();
    const { input } = mount(<TagInput value={[]} onChange={onChange} />);

    typeInto(input(), 'nefinalizat');
    // React delegates onBlur to focusout, since blur itself does not bubble.
    act(() => input().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));

    expect(onChange).toHaveBeenCalledWith(['nefinalizat']);
  });
});
