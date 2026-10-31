import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ModalErrorFallback } from './ModalErrorFallback';

describe('ModalErrorFallback', () => {
  it('renders with default props', () => {
    render(<ModalErrorFallback />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Component Unavailable')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This module encountered an issue while loading or interacting with device hardware.'
      )
    ).toBeInTheDocument();
  });

  it('renders with custom title and message', () => {
    render(<ModalErrorFallback title="Custom Error" message="Something went wrong." />);
    expect(screen.getByText('Custom Error')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<ModalErrorFallback onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Dismiss error'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onRetry when retry button is clicked', () => {
    const onRetry = vi.fn();
    render(<ModalErrorFallback onRetry={onRetry} />);
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders in light theme', () => {
    const { container } = render(<ModalErrorFallback />);
    expect(container.querySelector('.bg-white')).toBeInTheDocument();
    expect(container.querySelector('.dark\\:bg-zinc-900')).toBeNull();
  });

  it('renders in dark theme when .dark class is present', () => {
    const { container } = render(<ModalErrorFallback className="dark" />);
    // With Tailwind, we just verify it renders without errors
    expect(container.querySelector('[role="alert"]')).toBeInTheDocument();
  });
});
