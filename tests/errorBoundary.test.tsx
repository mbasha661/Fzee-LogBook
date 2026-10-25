// @vitest-environment jsdom
import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest';
import React from 'react';
import {cleanup, render, screen} from '@testing-library/react';
import {ErrorBoundary} from '../src/components/ErrorBoundary';

const Thrower = (): React.ReactNode => {
  throw new Error('boom test failure');
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <div>healthy app</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('healthy app')).toBeTruthy();
  });

  it('shows the recovery screen with the error message when a child throws', () => {
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('boom test failure')).toBeTruthy();
    expect(screen.getByText('Reload FzeeLog')).toBeTruthy();
  });
});
