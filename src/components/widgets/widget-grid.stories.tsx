import type { Meta, StoryObj } from '@storybook/react';
import { WidgetGrid, type WidgetConfig } from './widget-grid';

const SAMPLE_WIDGETS: WidgetConfig[] = [
  { id: 'commits', title: 'Recent Commits', icon: '🐙' },
  { id: 'deploys', title: 'Deployments', icon: '🚀' },
  { id: 'prs', title: 'Pull Requests', icon: '📋' },
  { id: 'firebase', title: 'Firebase', icon: '🔥' },
  { id: 'chart', title: 'Activity Chart', icon: '📈', colSpan: 2 },
  { id: 'stats', title: 'Stats', icon: '⚡', colSpan: 2 },
];

const meta: Meta<typeof WidgetGrid> = {
  title: 'Widgets/WidgetGrid',
  component: WidgetGrid,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', maxWidth: 1000 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof WidgetGrid>;

export const Default: Story = {
  args: {
    widgets: SAMPLE_WIDGETS,
    renderWidget: (_widget: WidgetConfig) => (
      <div className="space-y-2">
        {['Item 1', 'Item 2', 'Item 3'].map((item) => (
          <div
            key={item}
            className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-white/[0.03] dark:text-white/60"
          >
            <div className="h-1.5 w-1.5 rounded-full bg-indigo-400/60" />
            {item}
          </div>
        ))}
      </div>
    ),
  },
};

export const SingleColumn: Story = {
  args: {
    widgets: SAMPLE_WIDGETS.slice(0, 3).map((w) => ({ ...w, colSpan: 1 })),
    renderWidget: ({ title }: WidgetConfig) => (
      <p className="text-sm text-gray-500 dark:text-white/40">
        Content for {title}
      </p>
    ),
  },
};
