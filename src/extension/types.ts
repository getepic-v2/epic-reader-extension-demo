export type {
  BookData,
  ExtensionContext,
  Extension,
} from '@getepic-v2/reader-extension-types'

// --- Star Data Types (Epic Labs book extension data) ---
// Ported from EpicWeb epic-labs/models/epic-labs-book.types.ts (Angular → framework-agnostic)

export type StarType =
  | 'information'
  | 'game' // deprecated: page-level game star no longer used, kept for backward compat
  | 'multiple-choice'
  | 'puzzle'
  | 'flashcard'
  | 'infographic' // full-bleed HTML iframe info card
  | 'hotspot' // tap a region on the reading page
  // V1.1 new types
  | 'quiz-single' // option-card: fixed question, rotating option sets
  | 'quiz-compare' // option-card: fixed options (2 subjects), rotating questions
  | 'html-card' // H5 info card
  | 'flip-match' // flip cards and match pairs
  | 'drag-fill' // drag items from drawer into page slots
  | 'tap-match' // tap targets on page to answer questions
  | 'word-choice' // choose correct/wrong word pairs from a word bank

export interface StarCoordinates {
  x: number // 0-1 relative position
  y: number // 0-1 relative position
}

export interface MultipleChoiceOption {
  id: string
  text: string
  isCorrect: boolean
}

// --- V1.1 new types ---

export interface TreasureData {
  id: string
  type: 'key'
}

export interface TreasureConfig {
  totalTreasures: number
  gameUnlockThreshold: number
}

export interface GameConfig {
  gameUrl: string
  width?: string
  height?: string
}

export interface PortalConfig {
  pageNumber: number
  xPercent: number
  yPercent: number
  gameUrl: string
}

// quiz-single: one question, multiple option sets
export interface QuizSingleOptionSet {
  options: { text: string; isCorrect: boolean }[]
}

// quiz-compare: two fixed subjects, multiple question sets
export interface QuizCompareSubject {
  id: string
  label: string
  imageUrl?: string
  accent?: string
}

export interface QuizCompareQuestionSet {
  question: string
  correctSubjectId: string
}

// flip-match: card pairs
export interface FlipMatchPair {
  id: string
  label: string
  imageUrl: string
}

export interface FlipMatchActivationPoint {
  id: string
  xPercent: number
  yPercent: number
}

// drag-fill: draggable items with target positions
export interface DragFillItem {
  id: string
  imageUrl: string
  label?: string
  subtitle?: string
  accent?: string
  targetXPercent: number
  targetYPercent: number
  targetWidthPercent: number
  targetHeightPercent: number
}

// tap-match: clickable targets on page + questions
export interface TapMatchCharacter {
  id: string
  name: string
  imageUrl: string
  xPercent: number
  yPercent: number
}

export interface TapMatchQuestion {
  id: string
  text: string
  characterIndex: number
}

// hotspot: region on the page that the user must tap
export interface HotspotRegion {
  x: number // percent 0-100, single-page relative
  y: number
  width: number
  height: number
  direction: 'left' | 'right' // which page this region is on
}

// word-choice: word bank items
export interface WordChoiceWord {
  id: string
  text: string
  isCorrect: boolean
}

export interface StarContent {
  url?: string
  paragraph?: string
  question?: string
  options?: MultipleChoiceOption[]
  imageUrl?: string
  front?: string
  back?: string
  title?: string
  width?: string
  height?: string

  // V1.1 new fields
  treasure?: TreasureData
  // quiz-single
  quizSingleOptionSets?: QuizSingleOptionSet[]
  // quiz-compare
  quizCompareSubjects?: QuizCompareSubject[]
  quizCompareQuestionSets?: QuizCompareQuestionSet[]
  // html-card
  h5TemplateUrl?: string
  // flip-match
  flipMatchPairs?: FlipMatchPair[]
  flipMatchActivationPoints?: FlipMatchActivationPoint[]
  flipMatchSuccessAudioUrl?: string
  // drag-fill
  dragFillItems?: DragFillItem[]
  dragFillSuccessAudioUrl?: string
  dragFillTempPageUrl?: string
  dragFillTempPageDirection?: 'left' | 'right'
  // tap-match
  tapMatchCharacters?: TapMatchCharacter[]
  tapMatchQuestions?: TapMatchQuestion[]
  // word-choice
  wordChoiceWords?: WordChoiceWord[]
  // race-lab mode (used by both quiz-single and quiz-compare)
  raceLabMode?: 'compare' | 'decision' | 'signals' | 'simulator'
  // hotspot
  hotspotQuestion?: string
  hotspotRule?: string
  hotspotDescription?: string
  hotspotRegion?: HotspotRegion
  wrongRegion?: HotspotRegion
}

export interface Star {
  type: StarType
  coordinates: StarCoordinates
  content: StarContent
}

export interface ClickVideo {
  url: string
  coordinates: StarCoordinates & { width: number; height: number }
}

export interface EpicLabsBookPage {
  pageNumber: number
  starCount: number
  stars: Star[]
  motionUrl?: string
  clickVideos: ClickVideo[]
}

export interface VideoConfig {
  url: string
}

export interface EpicLabsBookData {
  startVideo?: VideoConfig
  endVideo?: VideoConfig
  pages: EpicLabsBookPage[]
  // V1.1 new fields
  treasureConfig?: TreasureConfig
  gameConfig?: GameConfig
  portalConfig?: PortalConfig
}

export interface InteractionState {
  activeStarIndex: number | null
}

/**
 * rectangle dimensions information
 */
export interface RectDimensions {
  x: number
  y: number
  width: number
  height: number
}

/**
 * drawer animation state
 */
export interface DrawerAnimationState {
  containerMounted: boolean
  contentLoaded: boolean
  isOpen: boolean
  isAnimating: boolean
}

// --- Drawer types (ported from epic-labs/drawer/drawer.types.ts) ---

export type DrawerContentType =
  | 'multiple-choice'
  | 'puzzle'
  | 'flashcard'
  | 'infographic'
  | 'hotspot'
  // V1.1 new types
  | 'quiz-single'
  | 'quiz-compare'
  | 'html-card'
  | 'flip-match'
  | 'drag-fill'
  | 'tap-match'
  | 'word-choice'

export type DrawerStarType =
  | 'quiz'
  | 'puzzle'
  | 'flashcard'
  | 'infographic'
  | 'hotspot'
  // V1.1 new types
  | 'quiz-single'
  | 'quiz-compare'
  | 'html-card'
  | 'flip-match'
  | 'drag-fill'
  | 'tap-match'
  | 'word-choice'

export interface DrawerCloseMetrics {
  starIndex?: number | null
  starType: DrawerStarType
  isStarComplete: boolean
  stayDuration?: number
  hasTreasure?: boolean
  playCount?: number // replay count (set by drawer components with replay)
  isCorrect?: boolean
}

export type DrawerCompleteEvent =
  | {
      type: 'multiple-choice'
      data: {
        hasAnswered: boolean
        optionId?: string
        isCorrect?: boolean
      }
    }
  | {
      type: 'puzzle'
      data: { isComplete: boolean }
    }
  | {
      type: 'flashcard'
      data: { isRevealed: boolean }
    }
  // V1.1 new events
  | {
      type: 'quiz-single'
      data: {
        isComplete: boolean
        correctCount: number
        totalCount: number
      }
    }
  | {
      type: 'quiz-compare'
      data: {
        isComplete: boolean
        correctCount: number
        totalCount: number
      }
    }
  | {
      type: 'html-card'
      data: { isComplete: boolean }
    }
  | {
      type: 'flip-match'
      data: {
        isComplete: boolean
        matchedPairs: number
        clickCount: number
      }
    }
  | {
      type: 'drag-fill'
      data: { isComplete: boolean; dragCount: number }
    }
  | {
      type: 'tap-match'
      data: { isComplete: boolean; isCorrect: boolean; clickCount: number }
    }
  | {
      type: 'word-choice'
      data: { isComplete: boolean; score: number; totalRounds: number }
    }
  | {
      type: 'infographic'
      data: { isComplete: boolean }
    }
  | {
      type: 'hotspot'
      data: { isCorrect: boolean }
    }

// --- Backward-compatible aliases (existing demo code uses these names) ---
export type EpicReaderBookPage = EpicLabsBookPage
export type EpicReaderBookData = EpicLabsBookData

// --- Modal data/result contracts (ported from EpicWeb modal components) ---

export interface VideoModalData {
  videoUrl: string
  skipLabel?: string
}

export interface VideoModalResult {
  /** 1 if watched to the end, 0 if skipped. */
  isFinish: number
  /** Watched seconds, 2 decimal places. */
  duration: number
}

export type EpicLabsGuideModalResult = 'start' | 'dont-show'

export interface BookRatingDialogData {
  bookTitle?: string
  coverUrl?: string
  bookId?: number
}

export interface BookRatingDialogResult {
  /** The chosen rating, or null if the user closed without submitting. */
  rating: number | null
}
