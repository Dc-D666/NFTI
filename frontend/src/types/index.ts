export type TestMode = 'quick' | 'full' | 'debug'

export interface Question {
  id: number
  text: string
  dimension: 'E' | 'I' | 'S' | 'N' | 'T' | 'F' | 'J' | 'P'
  direction: 1 | -1
  usedInQuick?: boolean
}

export interface UserAnswers {
  [questionId: number]: number
}

export interface DimensionScores {
  E: number
  I: number
  S: number
  N: number
  T: number
  F: number
  J: number
  P: number
}

export interface PersonalityType {
  code: string
  name: string
  description: string
  detail?: string
  isHidden: boolean
  unlockCondition?: string
  fourLetter?: string
  illustration?: string
}

export interface TestResult {
  mode: TestMode
  type: PersonalityType
  scores: DimensionScores
}
