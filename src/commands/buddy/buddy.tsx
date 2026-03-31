import { feature } from 'bun:bundle'
import type { ToolUseContext } from '../../Tool.js'
import { companionUserId, getCompanion, roll } from '../../buddy/companion.js'
import {
  RARITY_STARS,
  SPECIES,
  type Companion,
  type Species,
} from '../../buddy/types.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'

const HELP_TEXT = [
  'Usage: /buddy <hatch|card|pet|mute|unmute>',
  '  hatch   Create your companion if you do not have one yet',
  '  card    Show your companion card',
  '  pet     Pet your companion and trigger the animation',
  '  mute    Hide reactions and companion UI',
  '  unmute  Show reactions and companion UI again',
].join('\n')

const NAME_PREFIXES = [
  'Byte',
  'Mochi',
  'Pebble',
  'Comet',
  'Pico',
  'Nori',
  'Biscuit',
  'Nova',
  'Puddle',
  'Sprocket',
] as const

const NAME_SUFFIXES = [
  'loop',
  'bean',
  'spark',
  'patch',
  'whisk',
  'dot',
  'wink',
  'zip',
  'moss',
  'gleam',
] as const

const PET_REACTIONS = [
  'leans into the attention.',
  'does a delighted little wiggle.',
  'looks extremely pleased with itself.',
  'settles down with a smug expression.',
  'makes a tiny happy noise.',
] as const

function indexFromSeed(seed: number, length: number, salt: number): number {
  return Math.abs((seed ^ salt) % length)
}

function titleCase(value: string): string {
  return value[0]?.toUpperCase() + value.slice(1)
}

function primaryStat(companion: Companion): string {
  return Object.entries(companion.stats).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'WISDOM'
}

function buildPersonality(companion: Companion, seed: number): string {
  const topStat = primaryStat(companion)
  const tonesByStat: Record<string, readonly string[]> = {
    DEBUGGING: [
      'sniffs out bugs before they hatch',
      'watches your stack traces like a hawk',
    ],
    PATIENCE: [
      'waits calmly through long builds',
      'keeps a steady vibe during slow refactors',
    ],
    CHAOS: [
      'encourages bold experiments at suspicious hours',
      'loves a little harmless terminal chaos',
    ],
    WISDOM: [
      'acts like an old soul in a tiny sprite body',
      'responds to messes with unnerving calm',
    ],
    SNARK: [
      'judges flaky scripts with surgical precision',
      'has a sharp tongue for questionable shortcuts',
    ],
  }
  const tones = tonesByStat[topStat] ?? tonesByStat.WISDOM
  return tones[indexFromSeed(seed, tones.length, 0x51)]
}

function buildName(species: Species, seed: number): string {
  const prefix = NAME_PREFIXES[indexFromSeed(seed, NAME_PREFIXES.length, 0x1f)]
  const suffix = NAME_SUFFIXES[indexFromSeed(seed, NAME_SUFFIXES.length, 0x2f)]
  const speciesHint = titleCase(species).slice(0, 2)
  return `${prefix}${speciesHint}${suffix}`
}

function formatCompanionCard(companion: Companion): string {
  const shiny = companion.shiny ? ' shiny' : ''
  const stats = Object.entries(companion.stats)
    .map(([name, value]) => `${name.padEnd(10)} ${String(value).padStart(3)}`)
    .join('\n')

  return [
    `${companion.name} ${RARITY_STARS[companion.rarity]} ${titleCase(companion.rarity)}${shiny}`,
    `${titleCase(companion.species)} with ${companion.eye} eyes and a ${companion.hat} hat`,
    companion.personality,
    '',
    stats,
  ].join('\n')
}

function ensureBuddyEnabled(onDone: LocalJSXCommandOnDone): boolean {
  if (feature('BUDDY')) return true
  onDone('BUDDY is not enabled. Launch with `bun --feature=BUDDY run ./src/entrypoints/cli.tsx`.', {
    display: 'system',
  })
  return false
}

function hatchCompanion(): Companion {
  const userId = companionUserId()
  const { bones, inspirationSeed } = roll(userId)
  const name = buildName(bones.species, inspirationSeed)
  const companion: Companion = {
    ...bones,
    name,
    personality: buildPersonality({ ...bones, name, personality: '', hatchedAt: Date.now() }, inspirationSeed),
    hatchedAt: Date.now(),
  }

  saveGlobalConfig(current => ({
    ...current,
    companion: {
      name: companion.name,
      personality: companion.personality,
      hatchedAt: companion.hatchedAt,
    },
    companionMuted: false,
  }))

  return companion
}

function petReaction(companion: Companion): string {
  const seed = roll(companionUserId()).inspirationSeed
  return `${companion.name} ${PET_REACTIONS[indexFromSeed(seed, PET_REACTIONS.length, 0x77)]}`
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<null> {
  if (!ensureBuddyEnabled(onDone)) return null

  const subcommand = args.trim().toLowerCase()

  if (!subcommand) {
    onDone(HELP_TEXT, { display: 'system' })
    return null
  }

  if (subcommand === 'hatch') {
    const existing = getCompanion()
    if (existing) {
      onDone(`${existing.name} is already with you.\n\n${formatCompanionCard(existing)}`, {
        display: 'system',
      })
      return null
    }

    const companion = hatchCompanion()
    onDone(`Companion hatched.\n\n${formatCompanionCard(companion)}`, {
      display: 'system',
    })
    return null
  }

  const companion = getCompanion()
  if (!companion) {
    onDone('No companion yet. Run `/buddy hatch` first.', { display: 'system' })
    return null
  }

  if (subcommand === 'card') {
    onDone(formatCompanionCard(companion), { display: 'system' })
    return null
  }

  if (subcommand === 'pet') {
    const reaction = petReaction(companion)
    context.setAppState(prev => ({
      ...prev,
      companionPetAt: Date.now(),
      companionReaction: reaction,
    }))
    onDone(reaction, { display: 'system' })
    return null
  }

  if (subcommand === 'mute') {
    if (getGlobalConfig().companionMuted) {
      onDone(`${companion.name} is already muted.`, { display: 'system' })
      return null
    }
    saveGlobalConfig(current => ({
      ...current,
      companionMuted: true,
    }))
    context.setAppState(prev => ({
      ...prev,
      companionReaction: undefined,
    }))
    onDone(`${companion.name} is now muted.`, { display: 'system' })
    return null
  }

  if (subcommand === 'unmute') {
    if (!getGlobalConfig().companionMuted) {
      onDone(`${companion.name} is already unmuted.`, { display: 'system' })
      return null
    }
    saveGlobalConfig(current => ({
      ...current,
      companionMuted: false,
    }))
    onDone(`${companion.name} is visible again.`, { display: 'system' })
    return null
  }

  onDone(`Unknown /buddy action: ${subcommand}\n\n${HELP_TEXT}`, {
    display: 'system',
  })
  return null
}
