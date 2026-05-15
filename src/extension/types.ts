export type {
  BookData,
  ExtensionContext,
  Extension,
} from '@getepic-v2/reader-extension-types'

// --- Star Data Types (specific to this demo's labsData format) ---

export type StarType =
  | 'information'
  | 'game'
  | 'multiple-choice'
  | 'puzzle'
  | 'flashcard'
  | 'infographic'

export interface StarCoordinates {
  x: number // 0-1 relative position
  y: number // 0-1 relative position
}

export interface MultipleChoiceOption {
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
}

export interface Star {
  type: StarType
  coordinates: StarCoordinates
  content: StarContent
}

export interface EpicReaderBookPage {
  pageNumber: number
  starCount: number
  stars: Star[]
}

export interface EpicReaderBookData {
  startVideo?: { url: string }
  endVideo?: { url: string }
  pages: EpicReaderBookPage[]
}
