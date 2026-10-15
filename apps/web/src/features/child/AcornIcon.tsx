import type { HTMLAttributes } from 'react';

export function AcornIcon(props: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span {...props} data-acorn="" aria-hidden="true">
      <span className="acorn-texture" />
    </span>
  );
}
