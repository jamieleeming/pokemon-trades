import { ReactNode, FormEvent, ChangeEvent } from 'react';

declare global {
  type ReactFormEvent = FormEvent<HTMLFormElement>;
  type InputChangeEvent = ChangeEvent<HTMLInputElement>;
  type SelectChangeEvent = ChangeEvent<HTMLSelectElement>;
  
  interface FC<P = {}> {
    (props: P): ReactNode;
  }
}

export {}; 