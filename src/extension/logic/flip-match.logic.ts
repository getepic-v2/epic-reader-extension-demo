import type { FlipMatchPair } from '../types'

export interface FlipCardItem {
    id: string
    pairId: string
    face: 'image' | 'text'
    label: string
    imageUrl?: string
}

export interface FlipMatchState {
    cards: FlipCardItem[]
    openCardIds: string[]
    matchedPairIds: string[]
    wrongCardIds: string[]
    locked: boolean
    clickCount: number
    isComplete: boolean
}

export class FlipMatchLogic {
    private state: FlipMatchState
    private pairs: FlipMatchPair[]
    private onChangeCb: (() => void) | null = null

    constructor(pairs: FlipMatchPair[]) {
        this.pairs = pairs
        this.state = {
            cards: this.buildAndShuffleCards(pairs),
            openCardIds: [],
            matchedPairIds: [],
            wrongCardIds: [],
            locked: false,
            clickCount: 0,
            isComplete: false,
        }
    }

    onChange(cb: () => void): void {
        this.onChangeCb = cb
    }

    getState(): Readonly<FlipMatchState> {
        return this.state
    }

    flipCard(cardId: string): FlipMatchState {
        if (this.state.locked) {
            return this.state
        }

        const card = this.state.cards.find((c) => c.id === cardId)
        if (!card) {
            return this.state
        }

        // skip already open or matched
        if (this.state.openCardIds.includes(cardId)) {
            return this.state
        }
        if (this.state.matchedPairIds.includes(card.pairId)) {
            return this.state
        }

        const newOpen = [...this.state.openCardIds, cardId]

        this.state = {
            ...this.state,
            openCardIds: newOpen,
            clickCount: this.state.clickCount + 1,
        }

        if (newOpen.length === 2) {
            this.state.locked = true
            this.checkMatch(newOpen)
        }

        this.onChangeCb?.()
        return this.state
    }

    private checkMatch(openIds: string[]): void {
        const [firstId, secondId] = openIds
        const first = this.state.cards.find((c) => c.id === firstId)
        const second = this.state.cards.find((c) => c.id === secondId)

        if (!first || !second) {
            return
        }

        if (first.pairId === second.pairId) {
            // match
            const newMatched = [...this.state.matchedPairIds, first.pairId]
            const isComplete = newMatched.length === this.pairs.length

            this.state = {
                ...this.state,
                openCardIds: [],
                matchedPairIds: newMatched,
                locked: false,
                isComplete,
            }
        } else {
            // no match — briefly show wrong, then flip back
            this.state = {
                ...this.state,
                wrongCardIds: [firstId!, secondId!],
            }
        }
    }

    clearWrong(): void {
        this.state = {
            ...this.state,
            openCardIds: [],
            wrongCardIds: [],
            locked: false,
        }
        this.onChangeCb?.()
    }

    reset(): void {
        this.state = {
            cards: this.buildAndShuffleCards(this.pairs),
            openCardIds: [],
            matchedPairIds: [],
            wrongCardIds: [],
            locked: false,
            clickCount: 0,
            isComplete: false,
        }
        this.onChangeCb?.()
    }

    private buildAndShuffleCards(pairs: FlipMatchPair[]): FlipCardItem[] {
        const cards: FlipCardItem[] = []
        pairs.forEach((pair) => {
            cards.push({
                id: `${pair.id}-image`,
                pairId: pair.id,
                face: 'image',
                label: pair.label,
                imageUrl: pair.imageUrl,
            })
            cards.push({
                id: `${pair.id}-text`,
                pairId: pair.id,
                face: 'text',
                label: pair.label,
            })
        })

        // Fisher-Yates shuffle
        for (let i = cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            const tmp = cards[i]!
            cards[i] = cards[j]!
            cards[j] = tmp
        }

        return cards
    }
}
