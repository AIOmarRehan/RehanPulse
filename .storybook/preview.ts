import type { Preview } from '@storybook/react';
import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#0a0a1a' },
        { name: 'light', value: '#f9fafb' },
      ],
    },
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div className="dark font-sans">
        <Story />
      </div>
    ),
  ],
};

export default preview;
