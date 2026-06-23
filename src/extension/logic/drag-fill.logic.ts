import type { DragFillItem } from '../types'

export interface DragFillState {
    placedItemIds: string[]
    dragCount: number
    isComplete: boolean
}

export class DragFillLogic {
    private state: DragFillState
    private items: DragFillItem[]
    private onChangeCb: (() => void) | null = null

    constructor(items: DragFillItem[]) {
        this.items = items
        this.state = {
            placedItemIds: [],
            dragCount: 0,
            isComplete: false,
        }
    }

    onChange(cb: () => void): void {
        this.onChangeCb = cb
    }

    getState(): Readonly<DragFillState> {
        return this.state
    }

    getItems(): DragFillItem[] {
        return this.items
    }

    /**
     * check if a pointer drop hits a target zone
     * returns the matched item id or null
     */
    hitTest(
        pointerX: number,
        pointerY: number,
        spreadRect: DOMRect,
        excludeItemId?: string
    ): string | null {
        for (const item of this.items) {
            if (this.state.placedItemIds.includes(item.id)) {
                continue
            }
            if (excludeItemId && item.id === excludeItemId) {
                continue
            }

            const targetLeft =
                spreadRect.left +
                (spreadRect.width * item.targetXPercent) / 100
            const targetTop =
                spreadRect.top +
                (spreadRect.height * item.targetYPercent) / 100
            const targetWidth =
                (spreadRect.width * item.targetWidthPercent) / 100
            const targetHeight =
                (spreadRect.height * item.targetHeightPercent) / 100

            if (
                pointerX >= targetLeft &&
                pointerX <= targetLeft + targetWidth &&
                pointerY >= targetTop &&
                pointerY <= targetTop + targetHeight
            ) {
                return item.id
            }
        }

        return null
    }

    /**
     * place an item (called after successful hit test)
     */
    placeItem(itemId: string): DragFillState {
        if (this.state.placedItemIds.includes(itemId)) {
            return this.state
        }

        const newPlaced = [...this.state.placedItemIds, itemId]
        const isComplete = newPlaced.length >= this.items.length

        this.state = {
            placedItemIds: newPlaced,
            dragCount: this.state.dragCount + 1,
            isComplete,
        }
        this.onChangeCb?.()
        return this.state
    }

    /**
     * record a failed drag attempt
     */
    recordMiss(): void {
        this.state = {
            ...this.state,
            dragCount: this.state.dragCount + 1,
        }
        this.onChangeCb?.()
    }

    reset(): void {
        this.state = {
            placedItemIds: [],
            dragCount: 0,
            isComplete: false,
        }
        this.onChangeCb?.()
    }
}
