// -----------------------------------------------------------
//  [*] UI kit — the barrel
//
//  Re-exports the shared primitives so screens import from
//  '@/components/ui' instead of reaching into single files.
//  Pure re-exports — no code of its own.
// -----------------------------------------------------------

export { default as Button } from './Button';
export { default as Input } from './Input';
export { default as Card } from './Card';
export { default as LoadingSpinner } from './LoadingSpinner';
export { default as RefreshSpinner } from './RefreshSpinner';
export { default as SectionTitle } from './SectionTitle';
export { default as Badge } from './Badge';
export { default as Avatar } from './Avatar';
export { default as Screen } from './Screen';
export { default as Header } from './Header';
export { default as EmptyState } from './EmptyState';
export { default as ErrorState } from './ErrorState';
export { confirmAction, ConfirmHost } from './ConfirmDialog';
export { toastConfig } from './Toast';
