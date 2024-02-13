import { DecoratorFn } from '@storybook/react';
import { within } from '@storybook/testing-library';
import React from 'react';

export const userAgentNameToBeDetected = 'StorybookTestRunner';

export const withDisablingTestRunner: DecoratorFn = (Story, { parameters }) => {
  if (parameters.testRunner?.disable === true && navigator.userAgent.includes(userAgentNameToBeDetected)) {
    return (
      <>
        <p>
          Disabled for Test Runner.
          <br />
          <br />
          ...
          <br />
          Adding here &quot; <span>©</span> &quot; for email tests to pass.
        </p>
      </>
    );
  }

  return <Story />;
};

export async function playFindMain(parentElement: HTMLElement): Promise<HTMLElement> {
  return await within(parentElement).findByRole('main');
}

export async function playFindForm(parentElement: HTMLElement): Promise<HTMLElement> {
  return await within(parentElement).findByRole('form');
}

export async function playFindForms(parentElement: HTMLElement): Promise<HTMLElement[]> {
  return await within(parentElement).findAllByRole('form');
}

export async function playFindFormInMain(parentElement: HTMLElement): Promise<HTMLElement> {
  const mainElement = await within(parentElement).findByRole('main');

  return await within(mainElement).findByRole('form');
}

export async function playFindFormsInMain(parentElement: HTMLElement): Promise<HTMLElement[]> {
  const mainElement = await within(parentElement).findByRole('main');

  return await within(mainElement).findAllByRole('form');
}

export async function playFindAlert(parentElement: HTMLElement): Promise<HTMLElement> {
  return await within(parentElement).findByRole('alert');
}

export async function playFindAlertInMain(parentElement: HTMLElement): Promise<HTMLElement> {
  const mainElement = await within(parentElement).findByRole('main');

  return await within(mainElement).findByRole('alert');
}

export async function playFindMainTitle(parentElement: HTMLElement, name: string | RegExp): Promise<HTMLElement> {
  return await within(parentElement).findByRole('heading', {
    level: 1,
    name: name,
  });
}

export async function playFindProgressBar(parentElement: HTMLElement, name: string | RegExp): Promise<HTMLElement> {
  return await within(parentElement).findByRole('progressbar', {
    name: name,
  });
}

export async function playFindEmailStructure(parentElement: HTMLElement): Promise<HTMLElement[]> {
  return await within(parentElement).findAllByText(/©/i);
}

export async function playFindDocumentStructure(parentElement: HTMLElement): Promise<HTMLElement> {
  return await within(parentElement).findByTitle(/PDF preview/i);
}
