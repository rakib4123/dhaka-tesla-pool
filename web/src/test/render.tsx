import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { tokenStore } from '../api/client';
import { App } from '../App';

function LocationProbe() {
  const { pathname } = useLocation();
  return <output data-testid="location">{pathname}</output>;
}

/** Renders the whole app (routing + auth) at `path`, like a browser tab would. */
export function renderApp(path = '/', { signedIn = false }: { signedIn?: boolean } = {}) {
  if (signedIn) tokenStore.set('test-token');
  const user = userEvent.setup();
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );
  return { user, ...utils };
}

export const currentPath = () => screen.getByTestId('location').textContent;
