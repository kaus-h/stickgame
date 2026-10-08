import { parseRuntimeTuning, type RuntimeTuning } from '../../content';

/**
 * Dev-only live tuning panel (GMR-28). Edits a copy of the runtime tuning, validates it with the
 * same parser the game uses, and applies it through `apply` (the simulation's retune). "Copy JSON"
 * yields text for content/tuning/runtime.json, which stays the source of truth. Toggle with F2.
 */
export function mountTuningPanel(
  initial: RuntimeTuning,
  apply: (tuning: RuntimeTuning) => void,
): () => void {
  let current = structuredClone(initial) as unknown as Record<string, unknown>;
  const root = document.createElement('div');
  root.style.cssText =
    'position:fixed;top:12px;right:12px;max-height:90vh;overflow:auto;z-index:10;display:none;' +
    'background:#f3efe6ee;border:1px solid #16161a;padding:8px 10px;font:12px monospace;color:#16161a';

  const status = document.createElement('div');
  status.style.margin = '6px 0';

  const rebuild = (): void => {
    root.replaceChildren();
    const title = document.createElement('div');
    title.textContent = 'tuning (F2)';
    title.style.fontWeight = 'bold';
    root.append(title);
    addFields(root, current, [], (path, value) => {
      const next = structuredClone(current);
      setPath(next, path, value);
      try {
        const parsed = parseRuntimeTuning(next);
        current = next;
        apply(parsed);
        status.textContent = `applied ${path.join('.')} = ${String(value)}`;
      } catch (e) {
        status.textContent = e instanceof Error ? e.message : String(e);
      }
    });
    const copy = document.createElement('button');
    copy.textContent = 'Copy JSON';
    copy.onclick = () => {
      void navigator.clipboard.writeText(`${JSON.stringify(current, null, 2)}\n`);
      status.textContent = 'copied: paste into content/tuning/runtime.json';
    };
    const reset = document.createElement('button');
    reset.textContent = 'Reset';
    reset.onclick = () => {
      current = structuredClone(initial) as unknown as Record<string, unknown>;
      apply(initial);
      rebuild();
      status.textContent = 'reset to shipped values';
    };
    root.append(copy, ' ', reset, status);
  };
  rebuild();

  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'F2') return;
    e.preventDefault();
    root.style.display = root.style.display === 'none' ? 'block' : 'none';
  };
  window.addEventListener('keydown', onKey);
  document.body.append(root);
  return () => {
    window.removeEventListener('keydown', onKey);
    root.remove();
  };
}

function addFields(
  parent: HTMLElement,
  obj: Record<string, unknown>,
  path: string[],
  onChange: (path: string[], value: number) => void,
): void {
  for (const [key, value] of Object.entries(obj)) {
    const p = [...path, key];
    if (typeof value === 'number') {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;justify-content:space-between;gap:8px;margin:1px 0';
      const input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.value = String(value);
      input.style.width = '80px';
      input.onchange = () => {
        onChange(p, Number(input.value));
      };
      row.append(p.slice(1).join('.') || key, input);
      parent.append(row);
    } else if (typeof value === 'object' && value !== null) {
      const head = document.createElement('div');
      head.textContent = p.join('.');
      head.style.cssText = 'margin-top:6px;color:#5a5a5a';
      parent.append(head);
      addFields(parent, value as Record<string, unknown>, p, onChange);
    }
  }
}

function setPath(obj: Record<string, unknown>, path: string[], value: number): void {
  let o = obj;
  for (const k of path.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[path[path.length - 1] as string] = value;
}
