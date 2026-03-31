import type { Command } from '../../commands.js'

const buddy = {
  type: 'local-jsx',
  name: 'buddy',
  description: 'Hatch and interact with your terminal companion',
  argumentHint: '[hatch|card|pet|mute|unmute]',
  immediate: true,
  load: () => import('./buddy.js'),
} satisfies Command

export default buddy
