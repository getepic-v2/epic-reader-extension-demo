// --- Star Data Types ---

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

// --- Book Data (common fields) ---

export interface BookData {
  id: number
  title: string
  type: number // 1=Standard, 2=Audiobook, 3=Article, 4=Video
  author?: string
  numPages?: number
  aspectRatio?: number
  labData?: string
  coverColorR?: number
  coverColorG?: number
  coverColorB?: number
  language?: number
  bookDescription?: string
  [key: string]: unknown // other fields
}

// --- Extension Context API ---

export interface ExtensionContext {
  version: string
  analytics: {
    log(event: string, params?: Record<string, unknown>): void
  }
  slots: {
    get(slotId: string): ShadowRoot
  }
  data: {
    getBookId(): number | undefined
    getBookData(): BookData
    getCurrentPage(): number
    getLabsData(): unknown
    getFlipBookRect(): { x: number; y: number; width: number; height: number } | null
  }
  commands: {
    execute(command: string, payload?: unknown): void
  }
  events: {
    on(eventName: string, callback: (payload?: unknown) => void): () => void
  }
}

export interface Extension {
  activate(
    context: ExtensionContext,
  ): void | (() => void) | { deactivate?: () => void }
}
