import React, { Fragment, PropsWithChildren, useCallback, useState } from 'react';

import { ModalContext, ShowModalFactory } from '@etabli/src/components/modal/ModalContext';

export const ModalProvider = ({ children }: PropsWithChildren) => {
  const [render, setRender] = useState<ShowModalFactory | null>(null);
  const [open, setOpen] = useState(false);

  const onClose = useCallback(() => {
    setOpen(false);
  }, []);

  const showModal = useCallback((render: ShowModalFactory) => {
    setRender(() => render);
    setOpen(true);
  }, []);

  return (
    <Fragment>
      <>
        <ModalContext.Provider
          value={{
            showModal: showModal,
          }}
        >
          {children}
        </ModalContext.Provider>
        {render && render({ open, onClose })}
      </>
    </Fragment>
  );
};
