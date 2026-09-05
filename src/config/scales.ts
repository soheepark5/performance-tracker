/**
 * Anchors for every subjective 0-10 scale in the app.
 *
 * A 0-10 number is only comparable across two years if the anchors stay fixed,
 * so they live here rather than being retyped inside screens. Change them
 * deliberately -- changing an anchor silently redefines the history.
 */

export interface ScaleAnchors {
  question: string
  /** short helper shown under the question */
  hint?: string
  /** anchor text keyed by value; missing values interpolate visually */
  anchors: Record<number, string>
  invertColour?: boolean // true when a LOW number is the good outcome
}

export const SCALES = {
  clarity: {
    question: 'Cognitive clarity',
    hint: 'How sharp and functional the thinking machinery feels right now.',
    anchors: {
      0: 'Fog. Cannot hold a thought.',
      2: 'Heavy. Simple tasks need effort.',
      4: 'Working, but dull. Reading twice.',
      6: 'Clear enough for real work.',
      8: 'Sharp. Complex ideas hold easily.',
      10: 'Exceptional. Everything is available at once.',
    },
  },
  emotionalBaseline: {
    question: 'Emotional baseline',
    hint: 'Your background state today, not a reaction to any single event.',
    anchors: {
      0: 'Bleak, unstable.',
      2: 'Low and easily knocked over.',
      4: 'Flat but holding.',
      6: 'Steady, neutral-positive.',
      8: 'Solid and settled.',
      10: 'Unshakably level and open.',
    },
  },
  weeklyReserve: {
    question: 'After living through this week, how much physical reserve is left to repeat another week like it?',
    hint: 'Not "how tired am I tonight" — how much capacity is in the tank for a repeat.',
    anchors: {
      0: 'None. Another week like this would break something.',
      2: 'Running on fumes; would need to cut a lot.',
      4: 'Could repeat it, but at a cost.',
      6: 'Could repeat it cleanly.',
      8: 'Could repeat it and add a little more.',
      10: 'Could repeat it comfortably and go well beyond.',
    },
  },
  reserveAfter: {
    question: 'Reserve right after the session',
    hint: 'How much was still in the tank when you stopped.',
    anchors: {
      0: 'Completely emptied.',
      3: 'Could have done a little more.',
      5: 'Could have done ~50% more.',
      8: 'Barely dented.',
      10: 'Untouched.',
    },
  },
  rpe: {
    question: 'Perceived intensity (RPE)',
    hint: 'How hard the session felt overall.',
    anchors: {
      1: 'Very easy',
      3: 'Easy, conversational',
      5: 'Moderate',
      7: 'Hard, sustainable',
      9: 'Very hard',
      10: 'Maximal',
    },
  },
  recoveryCost: {
    question: 'What did yesterday’s session cost you today?',
    hint: 'Residual fatigue carried into today.',
    anchors: { 0: 'Nothing at all.', 3: 'Slight heaviness.', 5: 'Noticeable, worked around it.', 8: 'Dominated the day.', 10: 'Wrote the day off.' },
    invertColour: true,
  },
  fpContinuity: {
    question: 'Focus Point continuity',
    hint: 'How continuously the same problem stayed alive in your mind — including gaps, walks, meals.',
    anchors: {
      0: 'Forgot it existed.',
      2: 'Touched it once or twice.',
      4: 'Present during work blocks only.',
      6: 'Kept coming back through the day.',
      8: 'Almost always somewhere in the background.',
      10: 'Continuously alive from waking to sleeping.',
    },
  },
  slowThinking: {
    question: 'Slow thinking quality',
    hint: 'Staying with one problem, unhurried, letting the reasoning develop rather than forcing an answer.',
    anchors: {
      0: 'Rushed, tense, grabbing at answers.',
      2: 'Impatient; wanted it finished.',
      4: 'Some patience, but strained.',
      6: 'Mostly relaxed and willing to stay.',
      8: 'Unhurried, deep, comfortable staying with it.',
      10: 'Completely relaxed immersion; time disappeared.',
    },
  },
  automaticReturn: {
    question: 'Automatic return',
    hint: 'When attention drifted, how naturally did it come back — without a big act of will?',
    anchors: {
      0: 'Never came back on its own.',
      2: 'Needed heavy force each time.',
      4: 'Came back with deliberate effort.',
      6: 'Usually returned with a small nudge.',
      8: 'Returned on its own most of the time.',
      10: 'Snapped back by itself, effortlessly.',
    },
  },
  stressIntensity: {
    question: 'Stress intensity',
    hint: 'How big the hit was, independent of how well you handled it.',
    anchors: { 1: 'Minor irritation', 3: 'Noticeable', 5: 'Real stress', 7: 'Serious', 9: 'Severe', 10: 'Overwhelming' },
  },
  functionalImpact: {
    question: 'Functional impact',
    hint: 'How much it degraded your ability to think and work.',
    anchors: { 0: 'None — kept working normally.', 3: 'Slower, but functional.', 5: 'Half capacity.', 8: 'Could not work.', 10: 'Whole day gone.' },
    invertColour: true,
  },
  impulseIntensity: {
    question: 'Urge intensity',
    anchors: { 1: 'Faint', 3: 'Noticeable', 5: 'Strong', 7: 'Very strong', 9: 'Near-irresistible', 10: 'Total' },
  },
  coverage: {
    question: 'Attention coverage',
    hint: 'Roughly what share of your meaningful waking time was mentally connected to the Focus Point or core work.',
    anchors: { 0: 'None of it', 25: 'A quarter', 50: 'About half', 75: 'Most of it', 100: 'Nearly all of it' },
  },
} satisfies Record<string, ScaleAnchors>

export type ScaleKey = keyof typeof SCALES

/** Attention-sampling answer options and the credit each carries. */
export const SAMPLE_OPTIONS: { state: import('../domain/types').SampleState; label: string; hint: string; weight: number }[] = [
  { state: 'fp', label: 'The Focus Point', hint: 'directly on it', weight: 1 },
  { state: 'adjacent', label: 'Something adjacent', hint: 'related thinking', weight: 0.75 },
  { state: 'other_work', label: 'Other real work', hint: 'meaningful, not the FP', weight: 0.45 },
  { state: 'shallow', label: 'Admin / shallow', hint: 'email, errands, logistics', weight: 0.15 },
  { state: 'off', label: 'Off / drifting', hint: 'scrolling, blank, elsewhere', weight: 0 },
]

export const ENJOYMENT_OPTIONS = [
  { value: 0, label: 'Draining' },
  { value: 1, label: 'Neutral' },
  { value: 2, label: 'Enjoyable' },
  { value: 3, label: 'Deeply rewarding' },
] as const
