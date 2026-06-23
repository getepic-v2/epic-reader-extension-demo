import type {
    QuizCompareSubject,
    QuizCompareQuestionSet,
} from '../types'

export type QuizComparePhase = 'cover' | 'playing' | 'result'

export interface QuizCompareState {
    phase: QuizComparePhase
    currentQuestionIndex: number
    correctCount: number
    totalCount: number
    selectedSubjectId: string | null
    isCurrentCorrect: boolean | null
    isComplete: boolean
}

export class QuizCompareLogic {
    private state: QuizCompareState
    private subjects: QuizCompareSubject[]
    private questionSets: QuizCompareQuestionSet[]
    private onChangeCb: (() => void) | null = null

    constructor(
        subjects: QuizCompareSubject[],
        questionSets: QuizCompareQuestionSet[]
    ) {
        this.subjects = subjects
        this.questionSets = questionSets
        this.state = {
            phase: 'cover',
            currentQuestionIndex: 0,
            correctCount: 0,
            totalCount: questionSets.length,
            selectedSubjectId: null,
            isCurrentCorrect: null,
            isComplete: false,
        }
    }

    onChange(cb: () => void): void {
        this.onChangeCb = cb
    }

    getState(): Readonly<QuizCompareState> {
        return this.state
    }

    getSubjects(): QuizCompareSubject[] {
        return this.subjects
    }

    getCurrentQuestion(): string {
        return (
            this.questionSets[this.state.currentQuestionIndex]?.question || ''
        )
    }

    getCurrentCorrectSubjectId(): string | null {
        return (
            this.questionSets[this.state.currentQuestionIndex]
                ?.correctSubjectId ?? null
        )
    }

    start(): void {
        this.state = { ...this.state, phase: 'playing' }
        this.onChangeCb?.()
    }

    selectSubject(subjectId: string): void {
        if (
            this.state.phase !== 'playing' ||
            this.state.selectedSubjectId !== null
        ) {
            return
        }

        const currentSet = this.questionSets[this.state.currentQuestionIndex]
        if (!currentSet) {
            return
        }

        const isCorrect = subjectId === currentSet.correctSubjectId
        this.state = {
            ...this.state,
            selectedSubjectId: subjectId,
            isCurrentCorrect: isCorrect,
            correctCount: isCorrect
                ? this.state.correctCount + 1
                : this.state.correctCount,
        }
        this.onChangeCb?.()
    }

    timeout(): void {
        if (
            this.state.phase !== 'playing' ||
            this.state.selectedSubjectId !== null
        ) {
            return
        }
        this.state = {
            ...this.state,
            selectedSubjectId: '__timeout__',
            isCurrentCorrect: false,
        }
        this.onChangeCb?.()
    }

    advance(): void {
        const nextIndex = this.state.currentQuestionIndex + 1
        if (nextIndex >= this.state.totalCount) {
            this.state = {
                ...this.state,
                phase: 'result',
                isComplete: true,
            }
            this.onChangeCb?.()
            return
        }

        this.state = {
            ...this.state,
            currentQuestionIndex: nextIndex,
            selectedSubjectId: null,
            isCurrentCorrect: null,
        }
        this.onChangeCb?.()
    }

    reset(): void {
        this.state = {
            phase: 'cover',
            currentQuestionIndex: 0,
            correctCount: 0,
            totalCount: this.questionSets.length,
            selectedSubjectId: null,
            isCurrentCorrect: null,
            isComplete: false,
        }
        this.onChangeCb?.()
    }

    destroy(): void {}
}
