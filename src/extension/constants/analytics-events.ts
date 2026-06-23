/**
 * Epic Labs analytics event names.
 *
 * Ported from EpicWeb @epic/core constants (BIGQUERY-CONSTANTS/InteractiveBookConstants).
 * In the extension these are logged via context.analytics.log(name, params).
 * Names are kept identical to the Angular source so events stay aligned with
 * existing dashboards/queries.
 */

export const EPIC_LABS_CLICK_READ_BUTTON = 'epic_labs_click_read_button'
export const EPIC_LABS_CLICK_COMPLETE_BUTTON = 'epic_labs_click_complete_button'
export const EPIC_LABS_PAGE_EXPOSURE = 'epic_labs_page_exposure'
export const EPIC_LABS_CLOSE_STAR = 'epic_labs_close_star'
export const EPIC_LABS_FINISH_READING = 'epic_labs_finish_reading'
export const EPIC_LABS_STAR_CLICK = 'epic_labs_click_star'
export const EPIC_LABS_CLICK_GAME = 'epic_labs_click_game'
export const EPIC_LABS_COMPLETE_GAME = 'epic_labs_complete_game'
export const EPIC_LABS_BOOK_RATING = 'epic_labs_book_rating'

// V1.1: treasure & new interaction events
export const EPIC_LABS_KEY_COLLECT = 'epic_labs_key_collect'
export const EPIC_LABS_GAME_UNLOCK = 'epic_labs_game_unlock'
export const EPIC_LABS_QUIZ_SINGLE_COMPLETE = 'epic_labs_quiz_single_complete'
export const EPIC_LABS_QUIZ_COMPARE_COMPLETE = 'epic_labs_quiz_compare_complete'
export const EPIC_LABS_FLIP_MATCH_COMPLETE = 'epic_labs_flip_match_complete'
export const EPIC_LABS_DRAG_FILL_COMPLETE = 'epic_labs_drag_fill_complete'
export const EPIC_LABS_TAP_MATCH_COMPLETE = 'epic_labs_tap_match_complete'
export const EPIC_LABS_PAGE_CLOSE = 'epic_labs_page_close'
export const EPIC_LABS_GAME_CLOSE = 'epic_labs_game_close'
export const EPIC_LABS_EXIT_READING = 'epic_labs_exit_reading'
export const EPIC_LABS_GUIDE_CLOSE = 'epic_labs_guide_close'
