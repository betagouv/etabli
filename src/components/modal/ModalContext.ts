import { createContext } from 'react';

export interface ShowModalProps {
  open: boolean;
  onClose: () => void;
}

export type ShowModalFactory = (props: ShowModalProps) => {};

export interface ModalContextType {
  showModal: (factory: ShowModalFactory) => void;
}

export const ModalContext = createContext<ModalContextType>({
  showModal: () => {},
});
