import type {
  EpicLabsBookData,
  EpicLabsBookPage,
  Star,
  StarType,
  StarContent,
  MultipleChoiceOption,
  GameConfig,
  GameUrl,
  PortalConfig,
  QuizSingleOptionSet,
  QuizCompareSubject,
  FlipMatchPair,
  DragFillItem,
  TapMatchCharacter,
  TapMatchQuestion,
  WordChoiceWord,
  VideoConfig,
  ClickVideo,
  Shot,
  ShotType,
} from '../types'

/** XML star type → internal StarType mapping */
const XML_TO_STAR_TYPE: Record<string, StarType> = {
  information: 'information',
  game: 'game',
  'multiple-choice': 'multiple-choice',
  puzzle: 'puzzle',
  flashcard: 'flashcard',
  infographic: 'infographic',
  hotspot: 'hotspot',
  // V1.1 mappings
  'race-lab': 'quiz-single', // default; mode attribute determines actual type
  'duel-quiz': 'quiz-compare',
  'drag-fill': 'drag-fill',
  'flip-card': 'flip-match',
  'match-characters': 'tap-match',
  'h5-info-card': 'html-card',
  'egg-html': 'html-card',
  'word-choice': 'word-choice',
}

// Monotonic counter for stable id generation (avoids Date.now/Math.random
// collisions within the same parse pass).
let treasureIdCounter = 0
function nextTreasureId(): string {
  treasureIdCounter += 1
  return `key-${treasureIdCounter}`
}

/**
 * Parse Epic Labs book XML string into structured data.
 * Ported from EpicWeb epic-labs EpicLabsDataService (Angular → pure functions).
 */
export function parseLabsXml(xmlString: string): EpicLabsBookData {
  return parseXmlToJson(xmlString)
}

function parseXmlToJson(xmlText: string): EpicLabsBookData {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml')

  const parserError = xmlDoc.querySelector('parsererror')
  if (parserError) {
    throw new Error('XML parsing failed: ' + parserError.textContent)
  }

  const bookOutline = xmlDoc.querySelector('book_outline')
  if (!bookOutline) {
    throw new Error('Invalid XML structure: missing <book_outline> element')
  }

  const readingModule =
    bookOutline.querySelector('session reading_module') ||
    bookOutline.querySelector('reading_module')
  if (!readingModule) {
    throw new Error('Invalid XML structure: missing <reading_module> element')
  }

  const gameConfig = parseGameConfig(readingModule)
  const portalConfig = parsePortalConfig(readingModule)

  // Treasure system is always active (fixed 3 gems)
  const treasureConfig = { totalTreasures: 3, gameUnlockThreshold: 3 }

  return {
    startVideo: parseVideoUrl(readingModule, 'intro_video'),
    endVideo: parseVideoUrl(readingModule, 'summary-video'),
    pages: parsePagesNew(readingModule),
    treasureConfig,
    gameConfig,
    portalConfig,
  }
}

function parseVideoUrl(
  readingModule: Element,
  tagName: string,
): VideoConfig | undefined {
  const videoElement = readingModule.querySelector(tagName)
  const url = videoElement?.getAttribute('url')
  return url ? { url } : undefined
}

/**
 * Parse all <url> children of a <summary-game> element, capturing each node's
 * `type` attribute (e.g. "school"/"family"). Account-type selection between
 * them happens later (index.ts getLabsData), once context.user.isParent() is
 * available — the parser stays context-free.
 */
function parseGameUrls(summaryGameEl: Element): GameUrl[] {
  const urls: GameUrl[] = []
  summaryGameEl.querySelectorAll('url').forEach((u) => {
    const url = u.textContent?.trim()
    if (!url) return
    urls.push({ type: u.getAttribute('type') ?? undefined, url })
  })
  return urls
}

/** Pick a URL for the given account type, falling back to the first available. */
export function pickGameUrl(
  urls: GameUrl[],
  accountType: 'family' | 'school' | null,
): string {
  const first = urls[0]
  if (!first) return ''
  if (accountType) {
    const match = urls.find((u) => u.type === accountType)
    if (match) return match.url
  }
  return first.url
}

/** First URL in the list (caller guarantees non-empty). */
function firstGameUrl(urls: GameUrl[]): string {
  return urls[0]?.url ?? ''
}

function parsePortalConfig(readingModule: Element): PortalConfig | undefined {
  const el = readingModule.querySelector('summary-game')
  if (!el) return undefined

  const gameUrls = parseGameUrls(el)
  if (gameUrls.length === 0) return undefined

  const xmlPageNumber = parseInt(
    el.querySelector('page_number')?.textContent || '0',
    10,
  )
  const pageNumber = xmlPageNumber === 2 ? 2 : (xmlPageNumber - 1) * 2

  const coordsEl = el.querySelector('coordinates')
  const x = parseFloat(coordsEl?.querySelector('x')?.textContent || '0')
  const y = parseFloat(coordsEl?.querySelector('y')?.textContent || '0')

  return {
    pageNumber,
    xPercent: x,
    yPercent: y,
    gameUrl: firstGameUrl(gameUrls),
    gameUrls,
  }
}

function parseGameConfig(readingModule: Element): GameConfig | undefined {
  const summaryGameEl = readingModule.querySelector('summary-game')
  if (!summaryGameEl) {
    return undefined
  }

  const gameUrls = parseGameUrls(summaryGameEl)
  if (gameUrls.length === 0) {
    return undefined
  }

  return {
    gameUrl: firstGameUrl(gameUrls),
    gameUrls,
  }
}

function parsePagesNew(readingModule: Element): EpicLabsBookPage[] {
  const pages: EpicLabsBookPage[] = []
  const pageElements = readingModule.querySelectorAll('pages > page')

  pageElements.forEach((pageElement) => {
    const xmlPageNumber = parseInt(
      pageElement.getAttribute('number') || '0',
      10,
    )
    const actualPageNumber =
      xmlPageNumber === 2 ? 2 : (xmlPageNumber - 1) * 2

    const stars = parseStarsNew(pageElement)
    const motionUrl = pageElement.getAttribute('motion_url') || undefined
    const clickVideos = parseClickVideos(pageElement)
    const shots = parseShots(pageElement)

    pages.push({
      pageNumber: actualPageNumber,
      starCount: stars.length,
      stars,
      motionUrl,
      clickVideos,
      shots,
    })
  })

  return pages
}

function parseStarsNew(pageElement: Element): Star[] {
  const stars: Star[] = []
  const starElements = pageElement.querySelectorAll('star_items > star')

  starElements.forEach((starElement) => {
    const xmlType = starElement.getAttribute('type') || ''
    const starType = mapXmlTypeToStarType(xmlType, starElement)

    const coordinatesElement = starElement.querySelector('coordinates')
    const xPercent = parseFloat(
      coordinatesElement?.querySelector('x')?.textContent || '0',
    )
    const yPercent = parseFloat(
      coordinatesElement?.querySelector('y')?.textContent || '0',
    )

    const x = xPercent / 100
    const y = yPercent / 100

    stars.push({
      type: starType,
      coordinates: { x, y },
      content: parseStarContentNew(starElement, starType),
    })
  })

  return stars
}

function parseClickVideos(pageElement: Element): ClickVideo[] {
  const clickVideos: ClickVideo[] = []
  const cvElements = pageElement.querySelectorAll('click_videos > click_video')

  cvElements.forEach((cvElement) => {
    const url = cvElement.querySelector('url')?.textContent?.trim() || ''
    if (!url) return

    const coordsEl = cvElement.querySelector('coordinates')
    const x =
      parseFloat(coordsEl?.querySelector('x')?.textContent || '0') / 100
    const y =
      parseFloat(coordsEl?.querySelector('y')?.textContent || '0') / 100
    const width =
      parseFloat(coordsEl?.querySelector('width')?.textContent || '1') / 100
    const height =
      parseFloat(coordsEl?.querySelector('height')?.textContent || '1') / 100

    clickVideos.push({
      url,
      coordinates: { x, y, width, height },
    })
  })

  return clickVideos
}

function parseShots(pageElement: Element): Shot[] {
  const shots: Shot[] = []
  const shotElements = pageElement.querySelectorAll('shots > shot')

  shotElements.forEach((shotElement) => {
    const url = shotElement.querySelector('url')?.textContent?.trim() || ''
    if (!url) return // skip malformed shots, mirroring parseClickVideos

    const index = parseInt(shotElement.getAttribute('index') || '0', 10)
    const type = (shotElement.getAttribute('type') || 'video') as ShotType
    const loop = parseInt(shotElement.getAttribute('loop') || '0', 10)

    // Empty <subtitle/> → textContent is '' → undefined
    const subtitleRaw =
      shotElement.querySelector('subtitle')?.textContent?.trim() || ''
    const subtitleUrl = subtitleRaw || undefined

    shots.push({ index, type, loop, url, subtitleUrl })
  })

  // Defensive: play in ascending `index` order regardless of XML order.
  shots.sort((a, b) => a.index - b.index)
  return shots
}

function mapXmlTypeToStarType(xmlType: string, starElement: Element): StarType {
  if (xmlType === 'race-lab') {
    const mode = starElement
      .querySelector('star_content')
      ?.getAttribute('mode')
    if (mode === 'compare' || mode === 'simulator') {
      return 'quiz-compare'
    }
    return 'quiz-single'
  }

  // duel-quiz maps to quiz-compare
  if (xmlType === 'duel-quiz') {
    return 'quiz-compare'
  }

  return XML_TO_STAR_TYPE[xmlType] || (xmlType as StarType)
}

function parseStarContentNew(
  starElement: Element,
  type: StarType,
): StarContent {
  const content: StarContent = {}
  const starContentElement = starElement.querySelector('star_content')

  if (!starContentElement) {
    return content
  }

  // parse <reward><key amount="N"/></reward>
  const keyEl = starContentElement.querySelector('reward > key')
  if (keyEl) {
    const amount = parseInt(keyEl.getAttribute('amount') || '0', 10)
    if (amount > 0) {
      content.treasure = {
        id: nextTreasureId(),
        type: 'key',
      }
    }
  }

  switch (type) {
    case 'information':
      content.url =
        starContentElement.querySelector('url')?.textContent || ''
      content.paragraph =
        starContentElement.querySelector('paragraph')?.textContent || ''
      break

    case 'game':
      content.url =
        starContentElement.querySelector('url')?.textContent || ''
      break

    case 'multiple-choice':
      content.question =
        starContentElement.querySelector('question')?.textContent || ''
      content.options = parseMultipleChoiceOptionsNew(starContentElement)
      break

    case 'puzzle':
      content.imageUrl =
        starContentElement.querySelector('url')?.textContent || ''
      break

    case 'flashcard':
      content.front =
        starContentElement.querySelector('front')?.textContent || ''
      content.back =
        starContentElement.querySelector('back')?.textContent || ''
      break

    case 'infographic':
      content.h5TemplateUrl =
        starContentElement.querySelector('url')?.textContent?.trim() || ''
      content.title =
        starContentElement.querySelector('title')?.textContent?.trim() || ''
      break

    case 'hotspot':
      parseHotspotContent(starContentElement, content)
      break

    case 'quiz-single':
      parseQuizSingleContent(starContentElement, content)
      break

    case 'quiz-compare':
      parseQuizCompareContent(starContentElement, content)
      break

    case 'html-card':
      content.h5TemplateUrl =
        starContentElement.querySelector('url')?.textContent || ''
      break

    case 'flip-match':
      parseFlipMatchContent(starContentElement, content)
      break

    case 'drag-fill':
      parseDragFillContent(starContentElement, content)
      break

    case 'tap-match':
      parseTapMatchContent(starContentElement, content)
      break

    case 'word-choice':
      parseWordChoiceContent(starContentElement, content)
      break
  }

  return content
}

function parseQuizSingleContent(
  starContentElement: Element,
  content: StarContent,
): void {
  content.title =
    starContentElement.querySelector('title')?.textContent || ''
  const mode = starContentElement.getAttribute('mode') || 'signals'
  content.raceLabMode = mode as StarContent['raceLabMode']

  if (mode === 'signals') {
    content.quizSingleOptionSets = Array.from(
      starContentElement.querySelectorAll('signals > signal'),
    ).map((signal) => ({
      options: [
        {
          text: signal.getAttribute('label')?.trim() || '',
          isCorrect: true,
        },
      ],
    })) as QuizSingleOptionSet[]
  }
}

function parseQuizCompareContent(
  starContentElement: Element,
  content: StarContent,
): void {
  const mode = starContentElement.getAttribute('mode') || 'compare'
  content.raceLabMode = mode as StarContent['raceLabMode']

  // Handle race-lab/compare: <subjects><subject>
  const raceSubjects =
    starContentElement.querySelectorAll('subjects > subject')
  if (raceSubjects.length > 0) {
    content.quizCompareSubjects = Array.from(raceSubjects).map(
      (subject, index) => ({
        id: subject.getAttribute('id')?.trim() || `subject-${index}`,
        label: subject.getAttribute('label')?.trim() || '',
        imageUrl: subject.getAttribute('image')?.trim() || undefined,
        accent: subject.getAttribute('accent')?.trim() || undefined,
      }),
    ) as QuizCompareSubject[]
    return
  }

  // Handle duel-quiz: <opponents><left id="..." label="...">imageUrl</left><right ...>
  const leftOpponent = starContentElement.querySelector('opponents > left')
  const rightOpponent = starContentElement.querySelector('opponents > right')

  if (leftOpponent && rightOpponent) {
    content.quizCompareSubjects = [
      {
        id: leftOpponent.getAttribute('id')?.trim() || 'left',
        label: leftOpponent.getAttribute('label')?.trim() || '',
        imageUrl: leftOpponent.textContent?.trim() || undefined,
      },
      {
        id: rightOpponent.getAttribute('id')?.trim() || 'right',
        label: rightOpponent.getAttribute('label')?.trim() || '',
        imageUrl: rightOpponent.textContent?.trim() || undefined,
      },
    ] as QuizCompareSubject[]

    // <questions><q correct="subjectId"><text>...</text></q></questions>
    content.quizCompareQuestionSets = Array.from(
      starContentElement.querySelectorAll('questions > q'),
    ).map((q, index) => ({
      question:
        q.querySelector('text')?.textContent?.trim() ||
        `Question ${index + 1}`,
      correctSubjectId: q.getAttribute('correct')?.trim() || '',
    }))
  }
}

function parseFlipMatchContent(
  starContentElement: Element,
  content: StarContent,
): void {
  content.title =
    starContentElement.querySelector('title')?.textContent || ''

  content.flipMatchPairs = Array.from(
    starContentElement.querySelectorAll('pairs > pair'),
  )
    .map((pair, index) => {
      const label = pair.getAttribute('label')?.trim() || ''
      const image = pair.getAttribute('image')?.trim() || ''
      if (!label || !image) {
        return null
      }
      return {
        id: `flip-pair-${index}`,
        label,
        imageUrl: image,
      } as FlipMatchPair
    })
    .filter((p): p is FlipMatchPair => p !== null)

  content.flipMatchActivationPoints = Array.from(
    starContentElement.querySelectorAll('activation_points > point'),
  ).map((point, index) => ({
    id: `flip-activation-${index}`,
    xPercent: parseFloat(point.getAttribute('x') || '50'),
    yPercent: parseFloat(point.getAttribute('y') || '50'),
  }))

  const successAudio =
    starContentElement.querySelector('success_audio')?.textContent
  if (successAudio) {
    content.flipMatchSuccessAudioUrl = successAudio.trim()
  }
}

function parseDragFillContent(
  starContentElement: Element,
  content: StarContent,
): void {
  content.dragFillItems = Array.from(
    starContentElement.querySelectorAll('items > item'),
  )
    .map((item, index) => {
      const image = item.getAttribute('image')?.trim() || ''
      if (!image) {
        return null
      }
      return {
        id: item.getAttribute('id')?.trim() || `drag-item-${index}`,
        imageUrl: image,
        label: item.getAttribute('label')?.trim(),
        subtitle: item.getAttribute('subtitle')?.trim(),
        accent: item.getAttribute('accent')?.trim(),
        targetXPercent: parseFloat(item.getAttribute('x') || '0'),
        targetYPercent: parseFloat(item.getAttribute('y') || '0'),
        targetWidthPercent: parseFloat(item.getAttribute('width') || '16'),
        targetHeightPercent: parseFloat(item.getAttribute('height') || '16'),
      } as DragFillItem
    })
    .filter((i): i is DragFillItem => i !== null)

  const tempPageEl = starContentElement.querySelector('temp_page')
  if (tempPageEl) {
    const url = tempPageEl.textContent?.trim()
    if (url) {
      content.dragFillTempPageUrl = url
      content.dragFillTempPageDirection =
        (tempPageEl.getAttribute('direction') as 'left' | 'right') || 'right'
    }
  }

  const successAudio =
    starContentElement.querySelector('success_audio')?.textContent
  if (successAudio) {
    content.dragFillSuccessAudioUrl = successAudio.trim()
  }
}

function parseTapMatchContent(
  starContentElement: Element,
  content: StarContent,
): void {
  content.title =
    starContentElement.querySelector('title')?.textContent || ''

  // Handle word-choice variant: <word_bank><word isCorrect="..." x="" y="" w="" h="">text</word>
  const wordItems = starContentElement.querySelectorAll('word_bank > word')
  if (wordItems.length > 0) {
    // Map word_bank to tap-match: each word becomes a "character" (clickable target on page)
    content.tapMatchCharacters = Array.from(wordItems)
      .map((word, index) => {
        const name = word.textContent?.trim() || ''
        if (!name) {
          return null
        }
        return {
          id: `word-${index}`,
          name,
          imageUrl: '',
          xPercent: parseFloat(word.getAttribute('x') || '0'),
          yPercent: parseFloat(word.getAttribute('y') || '0'),
        } as TapMatchCharacter
      })
      .filter((c): c is TapMatchCharacter => c !== null)

    // Correct words become questions (target the correct character by index)
    content.tapMatchQuestions = Array.from(wordItems)
      .map((word, index) => {
        const isCorrect = word.getAttribute('isCorrect') === 'true'
        if (!isCorrect) {
          return null
        }
        const text = word.textContent?.trim() || ''
        return {
          id: `question-${index}`,
          text,
          characterIndex: index,
        } as TapMatchQuestion
      })
      .filter((q): q is TapMatchQuestion => q !== null)
    return
  }

  // Standard match-characters: <characters><character> + <questions><question>
  content.tapMatchCharacters = Array.from(
    starContentElement.querySelectorAll('characters > character'),
  )
    .map((character, index) => {
      const name = character.getAttribute('name')?.trim() || ''
      const image = character.getAttribute('image')?.trim() || ''
      if (!name) {
        return null
      }
      return {
        id: `character-${index}`,
        name,
        imageUrl: image,
        xPercent: parseFloat(character.getAttribute('x') || '0'),
        yPercent: parseFloat(character.getAttribute('y') || '0'),
      } as TapMatchCharacter
    })
    .filter((c): c is TapMatchCharacter => c !== null)

  content.tapMatchQuestions = Array.from(
    starContentElement.querySelectorAll('questions > question'),
  )
    .map((question, index) => {
      const text = question.getAttribute('text')?.trim() || ''
      const characterIndex = parseInt(
        question.getAttribute('index') || '-1',
        10,
      )
      if (!text || characterIndex < 0) {
        return null
      }
      return {
        id: `question-${index}`,
        text,
        characterIndex,
      } as TapMatchQuestion
    })
    .filter((q): q is TapMatchQuestion => q !== null)
}

function parseWordChoiceContent(
  starContentElement: Element,
  content: StarContent,
): void {
  content.title =
    starContentElement.querySelector('title')?.textContent?.trim() || ''

  content.wordChoiceWords = Array.from(
    starContentElement.querySelectorAll('word_bank > word'),
  )
    .map((word, index) => {
      const text = word.textContent?.trim() || ''
      if (!text) return null
      return {
        id: `word-${index}`,
        text,
        isCorrect: word.getAttribute('isCorrect') === 'true',
      } as WordChoiceWord
    })
    .filter((w): w is WordChoiceWord => w !== null)
}

function parseHotspotContent(
  starContentElement: Element,
  content: StarContent,
): void {
  const getText = (tag: string) =>
    starContentElement.querySelector(tag)?.textContent?.trim() || ''
  const getNum = (tag: string) => parseFloat(getText(tag)) || 0

  content.hotspotQuestion = getText('question')
  content.hotspotRule = getText('rule')
  content.hotspotDescription = getText('hotspot_description')
  const direction = (getText('direction') as 'left' | 'right') || 'right'
  const wrongDirection =
    (getText('wrong_direction') as 'left' | 'right') || 'left'
  content.hotspotRegion = {
    x: getNum('hotspot_x'),
    y: getNum('hotspot_y'),
    width: getNum('hotspot_width'),
    height: getNum('hotspot_height'),
    direction,
  }
  content.wrongRegion = {
    x: getNum('wrong_x'),
    y: getNum('wrong_y'),
    width: getNum('wrong_width'),
    height: getNum('wrong_height'),
    direction: wrongDirection,
  }
}

function parseMultipleChoiceOptionsNew(
  starContentElement: Element,
): MultipleChoiceOption[] {
  const options: MultipleChoiceOption[] = []
  const optionElements =
    starContentElement.querySelectorAll('options > option')

  optionElements.forEach((optionElement) => {
    options.push({
      id: optionElement.getAttribute('id') || '',
      text: optionElement.textContent || '',
      isCorrect: optionElement.getAttribute('isCorrect') === 'true',
    })
  })

  return options
}

export function validateEpicLabsData(data: EpicLabsBookData): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!data.pages || data.pages.length === 0) {
    errors.push('No pages found')
  }

  data.pages?.forEach((page, index) => {
    if (typeof page.pageNumber !== 'number') {
      errors.push(`Invalid page number at index ${index}`)
    }

    page.stars?.forEach((star, starIndex) => {
      if (!star.type) {
        errors.push(
          `Missing star type at page ${page.pageNumber}, star ${starIndex}`,
        )
      }

      if (
        !star.coordinates ||
        typeof star.coordinates.x !== 'number' ||
        typeof star.coordinates.y !== 'number'
      ) {
        errors.push(
          `Invalid coordinates at page ${page.pageNumber}, star ${starIndex}`,
        )
      }
    })
  })

  return {
    isValid: errors.length === 0,
    errors,
  }
}
