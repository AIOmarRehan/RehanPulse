import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { CommandPalette, type SpotlightAction } from './command-palette';

const SAMPLE_ACTIONS: SpotlightAction[] = [
  { id: 'nav-dashboard', label: 'Dashboard', icon: '📊', group: 'Navigation', onSelect: () => {} },
  { id: 'nav-github', label: 'GitHub Activity', icon: '🐙', group: 'Navigation', onSelect: () => {} },
  { id: 'nav-deploys', label: 'Vercel Deployments', icon: '🚀', group: 'Navigation', onSelect: () => {} },
  { id: 'nav-firebase', label: 'Firebase', icon: '🔥', group: 'Navigation', onSelect: () => {} },
  { id: 'nav-alerts', label: 'Alerts', icon: '🔔', group: 'Navigation', onSelect: () => {} },
  { id: 'toggle-theme', label: 'Switch to Light Mode', icon: '☀️', group: 'Actions', keywords: 'theme dark light', onSelect: () => {} },
  { id: 'toggle-sidebar', label: 'Collapse Sidebar', icon: '📐', group: 'Actions', keywords: 'sidebar panel', onSelect: () => {} },
  { id: 'sign-out', label: 'Sign Out', icon: '🚪', group: 'Account', keywords: 'logout exit', onSelect: () => {} },
];

function CommandPaletteWrapper() {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
      >
        Open Command Palette (Ctrl+K)
      </button>
      <CommandPalette actions={SAMPLE_ACTIONS} open={open} onOpenChange={setOpen} />
    </div>
  );
}

const meta: Meta = {
  title: 'Spotlight/CommandPalette',
  component: CommandPalette,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => <CommandPaletteWrapper />,
};
