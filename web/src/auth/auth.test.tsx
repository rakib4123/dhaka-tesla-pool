import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { tokenStore } from '../api/client';
import { jashim, nusrat, tania } from '../test/fixtures';
import { mockApi, sequence } from '../test/mockApi';
import { currentPath, renderApp } from '../test/render';

const unauthorized = { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Your session has expired' } } };

describe('signing in', () => {
  it('sends anonymous visitors to the sign-in page', async () => {
    mockApi({});
    renderApp('/ride');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(currentPath()).toBe('/login');
  });

  it('signs Nusrat in with one tap and takes her to her ride', async () => {
    const { calls } = mockApi({
      'POST /auth/login': { body: { token: 'token-nusrat', user: nusrat } },
      'GET /me': { body: nusrat },
    });
    const { user } = renderApp('/login');

    await user.click(screen.getByRole('button', { name: /Sign in as Nusrat/ }));

    expect(await screen.findByText('Signed in as Nusrat')).toBeInTheDocument();
    expect(currentPath()).toBe('/ride');
    expect(tokenStore.get()).toBe('token-nusrat');
    expect(calls[0].body).toEqual({ email: 'nusrat@teslapool.test', password: 'bullet123' });
  });

  it('takes Jashim to the driver screen', async () => {
    mockApi({
      'POST /auth/login': { body: { token: 'token-jashim', user: jashim } },
      'GET /me': { body: jashim },
    });
    const { user } = renderApp('/login');

    await user.click(screen.getByRole('button', { name: /Sign in as Jashim/ }));

    expect(await screen.findByRole('link', { name: 'Drive' })).toBeInTheDocument();
    expect(currentPath()).toBe('/driver');
  });

  it("shows the API's message for a wrong password", async () => {
    mockApi({
      'POST /auth/login': { status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' } } },
    });
    const { user } = renderApp('/login');

    await user.type(screen.getByLabelText('Email'), 'nusrat@teslapool.test');
    await user.type(screen.getByLabelText('Password'), 'not-it');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect');
    expect(currentPath()).toBe('/login');
  });
});

describe('saved sessions', () => {
  it('restores a saved session on reload', async () => {
    mockApi({ 'GET /me': { body: nusrat } });
    renderApp('/', { signedIn: true });
    await waitFor(() => expect(currentPath()).toBe('/ride'));
  });

  it('ends a session the server no longer accepts, with a clear message', async () => {
    mockApi({ 'GET /me': unauthorized });
    renderApp('/ride', { signedIn: true });

    expect(await screen.findByText('Your session ended. Please sign in again.')).toBeInTheDocument();
    expect(currentPath()).toBe('/login');
    expect(tokenStore.get()).toBeNull();
  });

  it('offers a retry when the server is unreachable at start-up', async () => {
    mockApi({ 'GET /me': sequence({ networkError: true }, { body: nusrat }) });
    const { user } = renderApp('/ride', { signedIn: true });

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server");
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Signed in as Nusrat')).toBeInTheDocument();
  });

  it('keeps passengers out of the driver screens', async () => {
    mockApi({ 'GET /me': { body: nusrat } });
    renderApp('/driver', { signedIn: true });
    await waitFor(() => expect(currentPath()).toBe('/ride'));
  });

  it('signs out', async () => {
    mockApi({ 'GET /me': { body: nusrat } });
    const { user } = renderApp('/ride', { signedIn: true });

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(currentPath()).toBe('/login');
    expect(tokenStore.get()).toBeNull();
  });
});

describe('registering', () => {
  it('creates a passenger account and opens the ride screen', async () => {
    const { calls } = mockApi({
      'POST /auth/register': { status: 201, body: { token: 'token-tania', user: tania } },
      'GET /me': { body: tania },
    });
    const { user } = renderApp('/register');

    await user.type(screen.getByLabelText('Name'), 'Tania');
    await user.type(screen.getByLabelText('Email'), 'tania@teslapool.test');
    await user.type(screen.getByLabelText('Password'), 'rickshaw99');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(currentPath()).toBe('/ride'));
    expect(calls[0].body).toEqual({ name: 'Tania', email: 'tania@teslapool.test', password: 'rickshaw99' });
  });

  it('shows why registration failed', async () => {
    mockApi({
      'POST /auth/register': { status: 409, body: { error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' } } },
    });
    const { user } = renderApp('/register');

    await user.type(screen.getByLabelText('Name'), 'Nusrat');
    await user.type(screen.getByLabelText('Email'), 'nusrat@teslapool.test');
    await user.type(screen.getByLabelText('Password'), 'rickshaw99');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists');
  });
});
