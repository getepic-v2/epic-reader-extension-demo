/**
 * Design tokens ported from EpicWeb's SCSS variables (src/scss/variables.scss
 * + src/scss/mixins). The ported components reference these by name; keeping
 * them as JS constants here means the injected CSS uses the exact compiled
 * values instead of hand-transcribed approximations.
 *
 * Source of truth: EpicWeb/src/scss/. When a token has multiple SCSS
 * definitions across files (e.g. $epic-dark-silver), the value here is the
 * one that wins in the import order the reader app uses; discrepancies are
 * noted inline.
 */

// --- Fonts ---
export const FONT_PRIMARY = "'Roboto', sans-serif" // $primary-font
export const FONT_SECONDARY = "'Mikado', sans-serif" // $secondary-font (headings, buttons)
export const FONT_TERTIARY = "'Manrope', sans-serif" // $tertiary-font
export const FONT_BLACK = "'Roboto Black', sans-serif" // $primary-font-black

// --- Brand colors ---
export const C_EXCLAIM_BLUE = '#0a96e6' // $epic-exclaim-blue — primary action blue
export const C_DARK_BLUE = '#0b74bb' // $epic-dark-blue — button hover
export const C_DARK_GREY = '#3c4b62' // $epic-dark-grey / $epic-dark-silver (text)
// $epic-dark-silver has 3 defs (#3c4b62 / #474c55 / #768087); #3c4b62 is the
// common text color used by epic-h-text headings.
export const C_DARK_SILVER = '#3c4b62'
export const C_SILVER = '#afbbca' // $epic-silver — disabled button bg
export const C_LIGHT_SILVER = '#e0e6ed' // $epic-light-silver
export const C_SNOW_SILVER = '#f9fafd' // $epic-snow-silver — light surface
export const C_MIDNIGHT_SILVER = '#283b51' // $epic-midnight-silver — modal backdrop base
export const C_WHITE = '#ffffff'
export const C_BLACK = '#000000'

// --- Accent colors ---
export const C_OUTLAW_PINK = '#e9559b' // $epic-outlaw-pink
export const C_OUTLAW_PINK_SHADE = '#cb347c' // $epic-outlaw-pink-shade
export const C_GREEN = '#65c07e' // $epic-green
export const C_DARK_GREEN = '#31784c' // $epic-dark-green
export const C_ORANGE = '#ffa944' // $epic-orange
export const C_DARK_ORANGE = '#dd6e2f' // $epic-dark-orange
export const C_YELLOW = '#fbd868' // $epic-yellow
export const C_PURPLE = '#b66ad0' // $epic-purple
export const C_DARK_PURPLE = '#822ea9' // $epic-dark-purple
export const C_SCAREDY_PURPLE = '#3f1e56' // $epic-scaredy-purple — drawer bg
export const C_CORAL = '#fc766a' // $epic-coral
export const C_BRIGHT_YELLOW = '#e6d02c' // $epic-bright-family-yellow
export const C_CRYSTAL_LIGHT_BLUE = '#94d0d2' // $epic-crystal-light-blue
export const C_LIGHT_BLUE = '#abdffc' // $epic-light-blue
export const C_VERY_LIGHT_BLUE = '#e6f5fe' // $epic-very-light-blue

// --- Border radius ---
export const R_XS = '4px' // $border-radius-xs
export const R_S = '8px' // $border-radius-s
export const R_M = '16px' // $border-radius-m
export const R_L = '24px' // $border-radius-l
export const R_DEFAULT = R_M // $border-radius-default

// --- Box shadows ---
export const SHADOW_SUBTLE = '0px 1px 3px rgba(43, 71, 104, 0.15)' // $box-shadow-subtle
export const SHADOW_DISTANT = '0px 2px 14px rgba(44, 59, 86, 0.2)' // $box-shadow-distant
export const SHADOW_HEAVY = '0px 10px 100px rgba(44, 59, 86, 0.3)' // $box-shadow-heavy

// --- Breakpoints ---
export const BP_SM = '600px' // $sm-width
export const BP_MD = '960px' // $md-width
export const BP_LG = '1200px' // $lg-width

// --- Button (epic-btn mixin) ---
// $epic-exclaim-blue bg, $epic-white text, $secondary-font (Mikado), weight 400,
// border-radius 100px (pill). --l uses epic-h-text(4): 20px/26px Mikado.
export const BTN_RADIUS = '100px'
export const BTN_FONT = FONT_SECONDARY
export const BTN_WEIGHT = '400'
export const BTN_BG = C_EXCLAIM_BLUE
export const BTN_BG_HOVER = C_DARK_BLUE
export const BTN_COLOR = C_WHITE
export const BTN_DISABLED_BG = C_SILVER
// Sizes
export const BTN_M_PAD = '8px 32px'
export const BTN_M_FONT_SIZE = '16px'
export const BTN_M_LINE_HEIGHT = '22px'
export const BTN_L_PAD = '16px 40px'
export const BTN_L_FONT_SIZE = '20px'
export const BTN_L_LINE_HEIGHT = '26px'

// --- Modal overlay (epic-labs-modal) ---
export const MODAL_BACKDROP = 'rgba(60, 75, 98, 0.9)' // .epic-labs-modal-backdrop (rgba($epic-dark-grey, 0.9))
