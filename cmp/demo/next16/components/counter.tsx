"use client";
import { PropsWithChildren, useState } from "react";
import { CounterClientChild } from "@/components/counterClientChild";

export const Counter: FC<PropsWithChildren> = ({ children }) => {
  const [state, setState] = useState(0);
  return (
    <div className="flex gap-2">
      <span>{state}</span>
      <button onClick={() => setState((old) => old + 1)}>
        How are you tomorrow?.!!
      </button>
      <CounterClientChild />
      {children}
    </div>
  );
};
