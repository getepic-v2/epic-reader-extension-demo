import type { TapMatchCharacter, TapMatchQuestion } from '../types'

export interface TapMatchState {
    currentQuestionIndex: number
    matchedQuestionIds: string[]
    clickCount: number
    isComplete: boolean
}

export class TapMatchLogic {
    private state: TapMatchState
    private characters: TapMatchCharacter[]
    private questions: TapMatchQuestion[]
    private onChangeCb: (() => void) | null = null

    constructor(
        characters: TapMatchCharacter[],
        questions: TapMatchQuestion[]
    ) {
        this.characters = characters
        this.questions = questions
        this.state = {
            currentQuestionIndex: 0,
            matchedQuestionIds: [],
            clickCount: 0,
            isComplete: false,
        }
    }

    onChange(cb: () => void): void {
        this.onChangeCb = cb
    }

    getState(): Readonly<TapMatchState> {
        return this.state
    }

    getCharacters(): TapMatchCharacter[] {
        return this.characters
    }

    getCurrentQuestion(): TapMatchQuestion | null {
        return this.questions[this.state.currentQuestionIndex] || null
    }

    /**
     * handle a character tap
     * returns true if correct, false if wrong
     */
    tapCharacter(characterIndex: number): boolean {
        this.state = {
            ...this.state,
            clickCount: this.state.clickCount + 1,
        }

        const question = this.getCurrentQuestion()
        if (!question) {
            this.onChangeCb?.()
            return false
        }

        const isCorrect = characterIndex === question.characterIndex
        if (isCorrect) {
            const newMatched = [...this.state.matchedQuestionIds, question.id]
            const nextIndex = this.state.currentQuestionIndex + 1
            const isComplete = nextIndex >= this.questions.length

            this.state = {
                ...this.state,
                currentQuestionIndex: nextIndex,
                matchedQuestionIds: newMatched,
                isComplete,
            }
        }

        this.onChangeCb?.()
        return isCorrect
    }

    reset(): void {
        this.state = {
            currentQuestionIndex: 0,
            matchedQuestionIds: [],
            clickCount: 0,
            isComplete: false,
        }
        this.onChangeCb?.()
    }
}
