"use client";

import { FC, useState } from "react";

export const Counter: FC = () => {
  const [state, setState] = useState(0);
  return (
    <button onClick={() => setState((old) => old + 1)}>
      Clicked {state} times
    </button>
  );
};
