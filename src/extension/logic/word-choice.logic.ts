import type { WordChoiceWord } from '../types'

export interface WordChoiceQuestion {
    correctId: string
    options: Array<{ id: string; text: string }>
}

export interface WordChoiceState {
    phase: 'intro' | 'question' | 'result' | 'done'
    questions: WordChoiceQuestion[]
    qIndex: number
    picked: string | null
    isPickCorrect: boolean
    score: number
    totalRounds: number
}

export class WordChoiceLogic {
    private _state: WordChoiceState = {
        phase: 'intro',
        questions: [],
        qIndex: 0,
        picked: null,
        isPickCorrect: false,
        score: 0,
        totalRounds: 0,
    }
    private onChangeCb: (() => void) | null = null

    constructor(private words: WordChoiceWord[]) {}

    onChange(cb: () => void): void {
        this.onChangeCb = cb
    }

    getState(): Readonly<WordChoiceState> {
        return this._state
    }

    get currentQuestion(): WordChoiceQuestion | null {
        return this._state.questions[this._state.qIndex] ?? null
    }

    canStart(): boolean {
        const correct = this.words.filter((w) => w.isCorrect).length
        const wrong = this.words.filter((w) => !w.isCorrect).length
        return correct > 0 && wrong > 0
    }

    startGame(): void {
        const questions = this.buildQuestions()
        this._state = {
            phase: questions.length > 0 ? 'question' : 'done',
            questions,
            qIndex: 0,
            picked: null,
            isPickCorrect: false,
            score: 0,
            totalRounds: questions.length,
        }
        this.onChangeCb?.()
    }

    pick(optionId: string): void {
        if (this._state.phase !== 'question') return
        if (this._state.picked !== null) return
        const q = this.currentQuestion
        if (!q) return
        const isCorrect = optionId === q.correctId
        this._state = {
            ...this._state,
            picked: optionId,
            isPickCorrect: isCorrect,
            score: isCorrect ? this._state.score + 1 : this._state.score,
            phase: 'result',
        }
        this.onChangeCb?.()
    }

    advance(): void {
        if (this._state.phase !== 'result') return
        const next = this._state.qIndex + 1
        if (next < this._state.questions.length) {
            this._state = {
                ...this._state,
                phase: 'question',
                qIndex: next,
                picked: null,
                isPickCorrect: false,
            }
        } else {
            this._state = { ...this._state, phase: 'done' }
        }
        this.onChangeCb?.()
    }

    private buildQuestions(): WordChoiceQuestion[] {
        const correct = shuffle(this.words.filter((w) => w.isCorrect))
        const wrong = shuffle(this.words.filter((w) => !w.isCorrect))
        const count = Math.min(correct.length, wrong.length)
        return Array.from({ length: count }, (_, i) => {
            const cWord = correct[i]!
            const wWord = wrong[i]!
            return {
                correctId: cWord.id,
                options: shuffle([
                    { id: cWord.id, text: cWord.text },
                    { id: wWord.id, text: wWord.text },
                ]),
            }
        })
    }
}

function shuffle<T>(arr: T[]): T[] {
    const out = [...arr]
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const tmp = out[i]!
        out[i] = out[j]!
        out[j] = tmp
    }
    return out
}
