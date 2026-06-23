import type { QuizSingleOptionSet } from '../types'

export type QuizSinglePhase = 'cover' | 'playing' | 'result'

export interface QuizSingleState {
    phase: QuizSinglePhase
    currentQuestionIndex: number
    correctCount: number
    totalCount: number
    selectedOptionIndex: number | null
    isCurrentCorrect: boolean | null
    isComplete: boolean
}

export class QuizSingleLogic {
    private state: QuizSingleState
    private optionSets: QuizSingleOptionSet[]
    private question: string
    private timerMs: number
    private timerCallback: ((state: QuizSingleState) => void) | null = null
    private timerHandle: ReturnType<typeof setTimeout> | null = null

    constructor(
        question: string,
        optionSets: QuizSingleOptionSet[],
        timerMs = 10000
    ) {
        this.question = question
        this.optionSets = optionSets
        this.timerMs = timerMs
        this.state = {
            phase: 'cover',
            currentQuestionIndex: 0,
            correctCount: 0,
            totalCount: optionSets.length,
            selectedOptionIndex: null,
            isCurrentCorrect: null,
            isComplete: false,
        }
    }

    getState(): Readonly<QuizSingleState> {
        return this.state
    }

    getQuestion(): string {
        return this.question
    }

    getCurrentOptions(): { text: string; isCorrect: boolean }[] {
        const set = this.optionSets[this.state.currentQuestionIndex]
        return set?.options || []
    }

    setTimerCallback(cb: (state: QuizSingleState) => void): void {
        this.timerCallback = cb
    }

    start(): void {
        this.state = { ...this.state, phase: 'playing' }
        this.startTimer()
        this.timerCallback?.(this.state)
    }

    selectOption(optionIndex: number): void {
        if (
            this.state.phase !== 'playing' ||
            this.state.selectedOptionIndex !== null
        ) {
            return
        }

        const options = this.getCurrentOptions()
        const selected = options[optionIndex]
        if (!selected) {
            return
        }

        const isCorrect = selected.isCorrect
        this.state = {
            ...this.state,
            selectedOptionIndex: optionIndex,
            isCurrentCorrect: isCorrect,
            correctCount: isCorrect
                ? this.state.correctCount + 1
                : this.state.correctCount,
        }

        this.clearTimer()
        this.timerCallback?.(this.state)

        // auto-advance after 2s
        setTimeout(() => this.advance(), 2000)
    }

    private advance(): void {
        const nextIndex = this.state.currentQuestionIndex + 1
        if (nextIndex >= this.state.totalCount) {
            this.state = {
                ...this.state,
                phase: 'result',
                isComplete: true,
            }
            this.timerCallback?.(this.state)
            return
        }

        this.state = {
            ...this.state,
            currentQuestionIndex: nextIndex,
            selectedOptionIndex: null,
            isCurrentCorrect: null,
        }
        this.startTimer()
        this.timerCallback?.(this.state)
    }

    private startTimer(): void {
        this.clearTimer()
        this.timerHandle = setTimeout(() => {
            // time's up — mark as wrong and advance
            if (this.state.selectedOptionIndex === null) {
                this.state = {
                    ...this.state,
                    isCurrentCorrect: false,
                }
                this.advance()
            }
        }, this.timerMs)
    }

    private clearTimer(): void {
        if (this.timerHandle) {
            clearTimeout(this.timerHandle)
            this.timerHandle = null
        }
    }

    reset(): void {
        this.clearTimer()
        this.state = {
            phase: 'cover',
            currentQuestionIndex: 0,
            correctCount: 0,
            totalCount: this.optionSets.length,
            selectedOptionIndex: null,
            isCurrentCorrect: null,
            isComplete: false,
        }
        this.timerCallback?.(this.state)
    }

    destroy(): void {
        this.clearTimer()
        this.timerCallback = null
    }
}
